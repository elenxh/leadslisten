"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO } from "@/lib/dates";
import type { ProtokollAmpel, ProtokollSchritt } from "@/lib/types";

export type SimpleResult = { ok: true } | { ok: false; error: string };
export type CreateProtokollResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Eingeloggter User + Admin-Flag (über RLS-Client). Deaktivierte Konten
 *  gelten als nicht angemeldet – die Actions laufen über Service-Role. */
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

function adminClientOrError():
  | { ok: true; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; error: string } {
  try {
    return { ok: true, admin: createAdminClient() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Eine Aufgaben-Zeile aus dem Formular. `id` gesetzt = bestehende Aufgabe
// (erledigt-Status bleibt erhalten); ohne `id` = neue Aufgabe.
export interface AufgabeInput {
  id?: string;
  was: string;
  zugewiesen_an: string; // leitung_id
  bis_wann: string; // YYYY-MM-DD
}

export interface ProtokollInput {
  datum?: string | null; // YYYY-MM-DD
  uhrzeit?: string | null; // "HH:MM"
  thema?: string | null;
  inhalt?: string | null;
  ergebnis?: string | null;
  naechste_schritte?: string | null;
  schritte?: ProtokollSchritt[];
  aufgaben?: AufgabeInput[];
  wiedervorlage_am?: string | null; // YYYY-MM-DD
  ampel?: ProtokollAmpel | null;
  dauer_minuten?: number | null; // Meeting-Dauer (Pflicht bei neuen Protokollen)
}

const norm = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

/** Baut das DB-Update-Objekt aus den (optionalen) Eingabefeldern. */
function buildUpdate(felder: ProtokollInput): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (felder.datum !== undefined) update.datum = felder.datum || todayISO();
  if (felder.uhrzeit !== undefined) update.uhrzeit = norm(felder.uhrzeit);
  if (felder.thema !== undefined) update.thema = norm(felder.thema);
  if (felder.inhalt !== undefined) update.inhalt = norm(felder.inhalt);
  if (felder.ergebnis !== undefined) update.ergebnis = norm(felder.ergebnis);
  if (felder.naechste_schritte !== undefined)
    update.naechste_schritte = norm(felder.naechste_schritte);
  if (felder.schritte !== undefined) {
    // Nur Zeilen mit mindestens einem befüllten Feld behalten; Strings trimmen.
    update.schritte = (felder.schritte ?? [])
      .map((s) => ({
        was: (s.was ?? "").trim(),
        wer: (s.wer ?? "").trim(),
        bis_wann: (s.bis_wann ?? "").trim(),
      }))
      .filter((s) => s.was || s.wer || s.bis_wann);
  }
  if (felder.wiedervorlage_am !== undefined)
    update.wiedervorlage_am = felder.wiedervorlage_am || null;
  if (felder.ampel !== undefined) {
    update.ampel =
      felder.ampel && ["gruen", "gelb", "rot"].includes(felder.ampel)
        ? felder.ampel
        : null;
  }
  if (felder.dauer_minuten !== undefined) {
    update.dauer_minuten =
      felder.dauer_minuten && felder.dauer_minuten > 0
        ? Math.round(felder.dauer_minuten)
        : null;
  }
  return update;
}

type AdminClient = ReturnType<typeof createAdminClient>;

// Bereinigt + validiert die Aufgaben-Zeilen. Leere Zeilen fallen weg; teilweise
// befüllte Zeilen sind ein Fehler (Was, Wer und Bis-wann sind zusammen Pflicht).
// Nicht-Admins dürfen nur sich selbst zuweisen -> auf ownerId zwingen.
function cleanAufgaben(
  aufgaben: AufgabeInput[],
  ownerId: string,
  isAdmin: boolean,
): { ok: true; rows: AufgabeInput[] } | { ok: false; error: string } {
  const rows: AufgabeInput[] = [];
  for (const a of aufgaben) {
    const was = (a.was ?? "").trim();
    const wer = isAdmin ? (a.zugewiesen_an ?? "").trim() : ownerId;
    const bis = (a.bis_wann ?? "").slice(0, 10);
    if (!was && !(a.zugewiesen_an ?? "").trim() && !bis) continue; // leere Zeile
    if (!was || !wer || !bis) {
      return { ok: false, error: "Aufgabe unvollständig: Was, Wer und Bis-wann angeben." };
    }
    rows.push({ id: a.id, was, zugewiesen_an: wer, bis_wann: bis });
  }
  return { ok: true, rows };
}

// Gleicht die Protokoll-Aufgaben (quelle='protokoll') mit der Eingabe ab:
// bestehende (per id) aktualisieren (erledigt-Status BLEIBT), neue einfügen,
// entfernte löschen. Schreibt in die allgemeine `aufgaben`-Tabelle.
async function syncAufgaben(
  admin: AdminClient,
  protokollId: string,
  erstellerId: string,
  rows: AufgabeInput[],
): Promise<SimpleResult> {
  const { data: vorhanden } = await admin
    .from("aufgaben")
    .select("id")
    .eq("protokoll_id", protokollId)
    .eq("quelle", "protokoll");
  const bestehendeIds = new Set(((vorhanden ?? []) as { id: string }[]).map((r) => r.id));
  const behalten = new Set<string>();

  for (const r of rows) {
    if (r.id && bestehendeIds.has(r.id)) {
      behalten.add(r.id);
      const { error } = await admin
        .from("aufgaben")
        .update({ was: r.was, zugewiesen_an: r.zugewiesen_an, bis_wann: r.bis_wann })
        .eq("id", r.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await admin.from("aufgaben").insert({
        was: r.was,
        bis_wann: r.bis_wann,
        typ: "einzel",
        zugewiesen_an: r.zugewiesen_an,
        ersteller_id: erstellerId,
        quelle: "protokoll",
        protokoll_id: protokollId,
      });
      if (error) return { ok: false, error: error.message };
    }
  }

  const zuLoeschen = Array.from(bestehendeIds).filter((id) => !behalten.has(id));
  if (zuLoeschen.length > 0) {
    const { error } = await admin.from("aufgaben").delete().in("id", zuLoeschen);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Legt ein Protokoll für die Person `leitungId` an. Admin für jede Person,
 *  SL nur für sich selbst. */
export async function createProtokoll(
  leitungId: string,
  felder: ProtokollInput = {},
): Promise<CreateProtokollResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin && user.id !== leitungId)
    return { ok: false, error: "Keine Berechtigung." };
  // Dauer ist Pflicht bei neuen Protokollen (Meeting-Kopplung Stundennachweis).
  if (!(felder.dauer_minuten && felder.dauer_minuten > 0))
    return { ok: false, error: "Bitte die Dauer (Minuten) angeben." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const row = {
    leitung_id: leitungId,
    datum: todayISO(),
    schritte: [],
    ...buildUpdate(felder),
  };

  const { data, error } = await ac.admin
    .from("gespraechsprotokolle")
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const neueId = (data as { id: string }).id;

  if (felder.aufgaben !== undefined) {
    const clean = cleanAufgaben(felder.aufgaben, leitungId, user.isAdmin);
    if (!clean.ok) return clean;
    const sync = await syncAufgaben(ac.admin, neueId, user.id, clean.rows);
    if (!sync.ok) return sync;
  }

  revalidatePath(`/team/${leitungId}`);
  revalidatePath("/dashboard");
  revalidatePath("/aufgaben");
  return { ok: true, id: neueId };
}

/** Bearbeitet ein Protokoll. Admin alles, SL nur eigene. */
export async function updateProtokoll(
  id: string,
  felder: ProtokollInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { data: prot, error: readErr } = await ac.admin
    .from("gespraechsprotokolle")
    .select("leitung_id")
    .eq("id", id)
    .single();
  if (readErr || !prot)
    return { ok: false, error: "Protokoll nicht gefunden." };

  const ownerId = (prot as { leitung_id: string }).leitung_id;
  if (!user.isAdmin && user.id !== ownerId)
    return { ok: false, error: "Keine Berechtigung." };

  const update = buildUpdate(felder);
  if (Object.keys(update).length > 0) {
    const { error } = await ac.admin
      .from("gespraechsprotokolle")
      .update(update)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  if (felder.aufgaben !== undefined) {
    const clean = cleanAufgaben(felder.aufgaben, ownerId, user.isAdmin);
    if (!clean.ok) return clean;
    const sync = await syncAufgaben(ac.admin, id, user.id, clean.rows);
    if (!sync.ok) return sync;
  }

  revalidatePath(`/team/${ownerId}`);
  revalidatePath("/dashboard");
  revalidatePath("/aufgaben");
  return { ok: true };
}

/** Löscht ein Protokoll. Admin alles, SL nur eigene. */
export async function deleteProtokoll(id: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { data: prot, error: readErr } = await ac.admin
    .from("gespraechsprotokolle")
    .select("leitung_id")
    .eq("id", id)
    .single();
  if (readErr || !prot)
    return { ok: false, error: "Protokoll nicht gefunden." };

  const ownerId = (prot as { leitung_id: string }).leitung_id;
  if (!user.isAdmin && user.id !== ownerId)
    return { ok: false, error: "Keine Berechtigung." };

  const { error } = await ac.admin
    .from("gespraechsprotokolle")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/team/${ownerId}`);
  return { ok: true };
}
