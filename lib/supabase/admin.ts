import { createClient } from "@supabase/supabase-js";

/**
 * Liest die `role` aus einem Supabase-API-Key.
 *
 * - Legacy-Keys sind JWTs (`header.payload.signature`); die Rolle steht im
 *   Payload-Claim `role` ("service_role" oder "anon").
 * - Neue Keys haben Präfixe: `sb_secret_…` (umgeht RLS, = service_role) bzw.
 *   `sb_publishable_…` (RLS gilt, = anon).
 *
 * Gibt die erkannte Rolle zurück oder `null`, wenn das Format unbekannt ist.
 */
function detectKeyRole(key: string): "service_role" | "anon" | null {
  if (key.startsWith("sb_secret_")) return "service_role";
  if (key.startsWith("sb_publishable_")) return "anon";

  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      ) as { role?: string };
      if (payload.role === "service_role") return "service_role";
      if (payload.role === "anon") return "anon";
    } catch {
      // Kein gültiges JWT-Payload – Rolle unbekannt.
    }
  }
  return null;
}

/**
 * Server-only Supabase client using the SERVICE ROLE key.
 * Bypasses RLS and can manage auth users — NEVER import this in client code.
 * The key must be set in .env.local as SUPABASE_SERVICE_ROLE_KEY (never committed).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY fehlt. Bitte in den Environment Variables eintragen (Supabase → Project Settings → API → service_role).",
    );
  }

  // Frühe, klare Fehlermeldung statt eines kryptischen RLS-Fehlers beim INSERT,
  // falls versehentlich der anon-/publishable-Key hinterlegt wurde.
  const role = detectKeyRole(key);
  if (role === "anon") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY enthält den anon-/publishable-Key, nicht den service_role-Key. " +
        "Damit greift RLS und INSERTs werden blockiert. Bitte den service_role-Key " +
        "(Supabase → Project Settings → API → service_role) in Vercel hinterlegen und neu deployen.",
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
