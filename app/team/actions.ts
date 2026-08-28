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

export interface ProtokollInput {
  datum?: string | null; // YYYY-MM-DD
  uhrzeit?: string | null; // "HH:MM"
  thema?: string | null;
  inhalt?: string | null;
  ergebnis?: string | null;
  naechste_schritte?: string | null;
  schritte?: ProtokollSchritt[];
  wiedervorlage_am?: string | null; // YYYY-MM-DD
  ampel?: ProtokollAmpel | null;
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
  return update;
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

  revalidatePath(`/team/${leitungId}`);
  return { ok: true, id: (data as { id: string }).id };
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
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await ac.admin
    .from("gespraechsprotokolle")
    .update(update)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/team/${ownerId}`);
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
