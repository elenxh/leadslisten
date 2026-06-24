"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deriveOrtUndRing,
  normalizeKey,
  type RawSchule,
} from "@/lib/excel-import";

export interface ImportPayload {
  rows: RawSchule[];
  zustaendigId: string | null;
  standortId: string | null;
}

export type ImportResult =
  | {
      ok: true;
      created: number;
      updated: number;
      skipped: number;
      total: number;
    }
  | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Nicht angemeldet." };

  const { data: me } = await supabase
    .from("leitungen")
    .select("rolle")
    .eq("id", user.id)
    .single();

  if (!me || me.rolle !== "admin") {
    return { ok: false as const, error: "Keine Berechtigung." };
  }
  return { ok: true as const };
}

// Stammdaten, die bei Duplikaten aktualisiert werden dürfen.
// NIEMALS: status, naechster_anruf, akquise_notiz, zustaendig.
function stammdaten(row: RawSchule) {
  const { stadt, ring } = deriveOrtUndRing(row.bezirk);
  return {
    schulart: row.schulart,
    stadt,
    bezirk: row.bezirk,
    ring,
    homepage: row.homepage,
    ansprechpartner: row.ansprechpartner,
    rolle_ap: row.rolle_ap,
    mail: row.mail,
    tel: row.tel,
    notiz_original: row.notiz,
  };
}

export async function importSchulen(
  payload: ImportPayload,
): Promise<ImportResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const rows = (payload.rows ?? []).filter((r) => r.name?.trim());
  if (rows.length === 0) {
    return { ok: false, error: "Keine Schulen in der Datei gefunden." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const standortId = payload.standortId || null;

  // Bestehende Schulen laden, um Duplikate (Name + Bezirk) zu erkennen.
  const { data: existing, error: loadErr } = await admin
    .from("schulen")
    .select("id, name, bezirk, standort_id");
  if (loadErr) {
    return { ok: false, error: `Laden fehlgeschlagen: ${loadErr.message}` };
  }

  const byKey = new Map<string, { id: string; standort_id: string | null }>();
  for (const s of (existing ?? []) as {
    id: string;
    name: string;
    bezirk: string | null;
    standort_id: string | null;
  }[]) {
    byKey.set(normalizeKey(s.name, s.bezirk), {
      id: s.id,
      standort_id: s.standort_id,
    });
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; data: Record<string, unknown> }[] = [];
  const seen = new Set<string>(); // Duplikate innerhalb der Datei abfangen
  let skipped = 0;

  for (const row of rows) {
    const key = normalizeKey(row.name, row.bezirk);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    const match = byKey.get(key);
    if (match) {
      // Nur Stammdaten aktualisieren – Akquise-Daten bleiben unberührt.
      // Standort wird nur gefüllt, wenn die Schule noch keinen hat
      // (überschreibt also keine bestehende Zuordnung).
      const data: Record<string, unknown> = stammdaten(row);
      if (standortId && !match.standort_id) data.standort_id = standortId;
      toUpdate.push({ id: match.id, data });
    } else {
      toInsert.push({
        name: row.name.trim(),
        ...stammdaten(row),
        status: "neu",
        zustaendig: payload.zustaendigId || null,
        standort_id: standortId,
      });
    }
  }

  let created = 0;
  let updated = 0;

  // Neue Schulen in Batches einfügen.
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error } = await admin.from("schulen").insert(batch);
    if (error) {
      return {
        ok: false,
        error: `Einfügen fehlgeschlagen (nach ${created} neuen): ${error.message}`,
      };
    }
    created += batch.length;
  }

  // Bestehende aktualisieren (parallel in kleinen Gruppen).
  for (let i = 0; i < toUpdate.length; i += 20) {
    const batch = toUpdate.slice(i, i + 20);
    const results = await Promise.all(
      batch.map((u) =>
        admin.from("schulen").update(u.data).eq("id", u.id),
      ),
    );
    for (const r of results) {
      if (r.error) {
        return {
          ok: false,
          error: `Update fehlgeschlagen (nach ${updated}): ${r.error.message}`,
        };
      }
      updated++;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/import");

  return {
    ok: true,
    created,
    updated,
    skipped,
    total: rows.length,
  };
}
