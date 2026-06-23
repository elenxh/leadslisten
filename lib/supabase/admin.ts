import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the SERVICE ROLE key.
 * Bypasses RLS and can manage auth users — NEVER import this in client code.
 * The key must be set in .env.local as SUPABASE_SERVICE_ROLE_KEY (never committed).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY fehlt. Bitte in .env.local eintragen (Supabase → Project Settings → API → service_role).",
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
