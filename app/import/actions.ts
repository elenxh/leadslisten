"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseTutorioWorkbook,
  normalizeName,
  tutorioInsertData,
} from "@/lib/tutorio-import";

export interface SkippedInfo {
  name: string;
  sheet: string;
}

export type TutorioImportResult =
  | {
      ok: true;
      createdBySheet: { sheet: string; count: number }[];
      createdTotal: number;
      skipped: SkippedInfo[];
      skippedCount: number;
    }
  | { ok: false; error?: string; errors?: string[] };

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase
    .from("leitungen")
    .select("rolle, aktiv")
    .eq("id", user.id)
    .single();
  if (!me || me.aktiv === false) return null;
  return { id: user.id, isAdmin: me.rolle === "admin" };
}

export async function importTutorio(
  formData: FormData,
): Promise<TutorioImportResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const standortId = String(formData.get("standortId") ?? "").trim();
  if (!standortId) return { ok: false, error: "Bitte einen Standort wählen." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Keine Datei ausgewählt." };
  }
  if (!/\.xlsx?$/i.test(file.name)) {
    return { ok: false, error: "Bitte eine .xlsx-Datei wählen." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // --- Berechtigung serverseitig: Standort muss aktiv sein, und (Admin ODER
  //     SL mit Zuordnung zu genau diesem Standort). Nicht nur UI. ---
  const { data: standort } = await admin
    .from("standorte")
    .select("id, status")
    .eq("id", standortId)
    .maybeSingle();
  if (!standort || (standort as { status: string }).status !== "aktiv") {
    return { ok: false, error: "Ungültiger oder inaktiver Standort." };
  }
  if (!user.isAdmin) {
    const { data: rel } = await admin
      .from("leitung_standort")
      .select("standort_id")
      .eq("leitung_id", user.id)
      .eq("standort_id", standortId)
      .maybeSingle();
    if (!rel) {
      return {
        ok: false,
        error: "Keine Berechtigung für diesen Standort.",
      };
    }
  }

  // --- Parsen + Validieren (alles VOR jedem Schreiben). ---
  let parsed;
  try {
    parsed = parseTutorioWorkbook(await file.arrayBuffer());
  } catch (e) {
    return { ok: false, error: `Datei konnte nicht gelesen werden: ${(e as Error).message}` };
  }

  if (parsed.errors.length > 0) {
    // Alles-oder-nichts: bei Validierungsfehlern nichts importieren.
    return { ok: false, errors: parsed.errors };
  }
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      error: "Keine Daten in den Reitern gefunden (Schulen, Soziale Träger).",
    };
  }

  // --- Duplikate (Name am gewählten Standort, case-insensitiv, getrimmt). ---
  const existing = new Set<string>();
  const LOAD_PAGE = 1000;
  for (let page = 0; page < 200; page++) {
    const from = page * LOAD_PAGE;
    const { data, error } = await admin
      .from("schulen")
      .select("name")
      .eq("standort_id", standortId)
      .order("id", { ascending: true })
      .range(from, from + LOAD_PAGE - 1);
    if (error) return { ok: false, error: `Laden fehlgeschlagen: ${error.message}` };
    const batch = (data ?? []) as { name: string }[];
    for (const s of batch) existing.add(normalizeName(s.name));
    if (batch.length < LOAD_PAGE) break;
  }

  const toInsert: Record<string, unknown>[] = [];
  const insertSheets: string[] = []; // parallel zu toInsert, für Reiter-Zählung
  const skipped: SkippedInfo[] = [];
  const seen = new Set<string>();

  for (const row of parsed.rows) {
    const key = normalizeName(row.name);
    if (existing.has(key) || seen.has(key)) {
      skipped.push({ name: row.name.trim(), sheet: row.sheet });
      continue;
    }
    seen.add(key);
    toInsert.push(tutorioInsertData(row, standortId));
    insertSheets.push(row.sheet);
  }

  // --- Einfügen (Batches). Status 'Neu', kein Verlauf, keine Alt-Markierung. ---
  const createdCounts: Record<string, number> = {};
  let done = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error } = await admin.from("schulen").insert(batch);
    if (error) {
      return {
        ok: false,
        error: `Einfügen fehlgeschlagen (nach ${done} neuen): ${error.message}`,
      };
    }
    for (let j = 0; j < batch.length; j++) {
      const sheet = insertSheets[i + j];
      createdCounts[sheet] = (createdCounts[sheet] ?? 0) + 1;
    }
    done += batch.length;
  }

  revalidatePath("/dashboard");
  revalidatePath("/import");

  return {
    ok: true,
    createdBySheet: Object.entries(createdCounts).map(([sheet, count]) => ({
      sheet,
      count,
    })),
    createdTotal: done,
    skipped,
    skippedCount: skipped.length,
  };
}
