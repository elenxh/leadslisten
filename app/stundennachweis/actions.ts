"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SimpleResult = { ok: true } | { ok: false; error: string };

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

const norm = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

// ===================== Vertragsmodelle (nur Admin) =====================
export interface VertragsmodellInput {
  name: string;
  wochenstunden: number;
  calls_soll_pro_woche: number;
  aktiv?: boolean;
}

export async function createVertragsmodell(
  felder: VertragsmodellInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };
  const name = (felder.name ?? "").trim();
  if (!name) return { ok: false, error: "Name ist erforderlich." };
  if (!(felder.wochenstunden > 0) || !(felder.calls_soll_pro_woche > 0)) {
    return { ok: false, error: "Wochenstunden und Calls-Soll müssen > 0 sein." };
  }
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const { error } = await ac.admin.from("vertragsmodelle").insert({
    name,
    wochenstunden: felder.wochenstunden,
    calls_soll_pro_woche: felder.calls_soll_pro_woche,
    aktiv: felder.aktiv ?? true,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/vertragsmodelle");
  return { ok: true };
}

export async function updateVertragsmodell(
  id: string,
  felder: Partial<VertragsmodellInput>,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };
  const upd: Record<string, unknown> = {};
  if (felder.name !== undefined) {
    const n = felder.name.trim();
    if (!n) return { ok: false, error: "Name ist erforderlich." };
    upd.name = n;
  }
  if (felder.wochenstunden !== undefined) {
    if (!(felder.wochenstunden > 0))
      return { ok: false, error: "Wochenstunden müssen > 0 sein." };
    upd.wochenstunden = felder.wochenstunden;
  }
  if (felder.calls_soll_pro_woche !== undefined) {
    if (!(felder.calls_soll_pro_woche > 0))
      return { ok: false, error: "Calls-Soll muss > 0 sein." };
    upd.calls_soll_pro_woche = felder.calls_soll_pro_woche;
  }
  if (felder.aktiv !== undefined) upd.aktiv = felder.aktiv;
  if (Object.keys(upd).length === 0) return { ok: true };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const { error } = await ac.admin.from("vertragsmodelle").update(upd).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/vertragsmodelle");
  return { ok: true };
}

// Modell einer SL zuweisen (mit Gültig-ab). Historie: neue Zeile. Nur Admin.
export async function zuweiseVertrag(input: {
  leitungId: string;
  vertragsmodellId: string;
  giltAb: string; // YYYY-MM-DD
}): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };
  const giltAb = (input.giltAb || "").slice(0, 10);
  if (!giltAb) return { ok: false, error: "Gültig-ab-Datum ist erforderlich." };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  // Upsert auf (leitung_id, gilt_ab): gleicher Tag überschreibt das Modell.
  const { error } = await ac.admin.from("leitung_vertrag").upsert(
    {
      leitung_id: input.leitungId,
      vertragsmodell_id: input.vertragsmodellId,
      gilt_ab: giltAb,
    },
    { onConflict: "leitung_id,gilt_ab" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/leitungen");
  revalidatePath("/stundennachweis");
  return { ok: true };
}

export async function deleteVertragZuweisung(id: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const { error } = await ac.admin.from("leitung_vertrag").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/leitungen");
  revalidatePath("/stundennachweis");
  return { ok: true };
}

// ===================== Orga-/Meeting-Zeiten (self oder Admin) ==========
export interface OrgaInput {
  datum: string;
  dauer_minuten: number;
  kategorie: "meeting_teamleitung" | "orga";
  beschreibung?: string | null;
}

async function darfEintrag(
  admin: ReturnType<typeof createAdminClient>,
  tabelle: string,
  id: string,
  user: { id: string; isAdmin: boolean },
): Promise<SimpleResult> {
  const { data } = await admin.from(tabelle).select("leitung_id").eq("id", id).single();
  if (!data) return { ok: false, error: "Eintrag nicht gefunden." };
  const owner = (data as { leitung_id: string }).leitung_id;
  if (!user.isAdmin && owner !== user.id)
    return { ok: false, error: "Keine Berechtigung." };
  return { ok: true };
}

function validOrga(f: OrgaInput): string | null {
  if (!(f.datum || "").slice(0, 10)) return "Datum ist erforderlich.";
  if (!(f.dauer_minuten > 0)) return "Dauer (Minuten) muss > 0 sein.";
  if (!["meeting_teamleitung", "orga"].includes(f.kategorie))
    return "Ungültige Kategorie.";
  return null;
}

export async function createOrgaZeit(
  leitungId: string,
  felder: OrgaInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin && leitungId !== user.id)
    return { ok: false, error: "Keine Berechtigung." };
  const err = validOrga(felder);
  if (err) return { ok: false, error: err };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const { error } = await ac.admin.from("orga_zeiten").insert({
    leitung_id: leitungId,
    datum: felder.datum.slice(0, 10),
    dauer_minuten: Math.round(felder.dauer_minuten),
    kategorie: felder.kategorie,
    beschreibung: norm(felder.beschreibung),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/stundennachweis");
  return { ok: true };
}

export async function updateOrgaZeit(
  id: string,
  felder: OrgaInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  const err = validOrga(felder);
  if (err) return { ok: false, error: err };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const perm = await darfEintrag(ac.admin, "orga_zeiten", id, user);
  if (!perm.ok) return perm;
  const { error } = await ac.admin
    .from("orga_zeiten")
    .update({
      datum: felder.datum.slice(0, 10),
      dauer_minuten: Math.round(felder.dauer_minuten),
      kategorie: felder.kategorie,
      beschreibung: norm(felder.beschreibung),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/stundennachweis");
  return { ok: true };
}

export async function deleteOrgaZeit(id: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const perm = await darfEintrag(ac.admin, "orga_zeiten", id, user);
  if (!perm.ok) return perm;
  const { error } = await ac.admin.from("orga_zeiten").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/stundennachweis");
  return { ok: true };
}

// ===================== Arbeitsstunden-Selbstangabe (self oder Admin) ===
export interface ArbeitsstundenInput {
  datum: string;
  minuten: number;
  von?: string | null;
  bis?: string | null;
  notiz?: string | null;
}

function validStunden(f: ArbeitsstundenInput): string | null {
  if (!(f.datum || "").slice(0, 10)) return "Datum ist erforderlich.";
  if (!(f.minuten > 0)) return "Dauer muss > 0 sein.";
  return null;
}

export async function createArbeitsstunde(
  leitungId: string,
  felder: ArbeitsstundenInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin && leitungId !== user.id)
    return { ok: false, error: "Keine Berechtigung." };
  const err = validStunden(felder);
  if (err) return { ok: false, error: err };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const { error } = await ac.admin.from("arbeitsstunden").insert({
    leitung_id: leitungId,
    datum: felder.datum.slice(0, 10),
    minuten: Math.round(felder.minuten),
    von: norm(felder.von),
    bis: norm(felder.bis),
    notiz: norm(felder.notiz),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/stundennachweis");
  return { ok: true };
}

export async function updateArbeitsstunde(
  id: string,
  felder: ArbeitsstundenInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  const err = validStunden(felder);
  if (err) return { ok: false, error: err };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const perm = await darfEintrag(ac.admin, "arbeitsstunden", id, user);
  if (!perm.ok) return perm;
  const { error } = await ac.admin
    .from("arbeitsstunden")
    .update({
      datum: felder.datum.slice(0, 10),
      minuten: Math.round(felder.minuten),
      von: norm(felder.von),
      bis: norm(felder.bis),
      notiz: norm(felder.notiz),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/stundennachweis");
  return { ok: true };
}

export async function deleteArbeitsstunde(id: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const perm = await darfEintrag(ac.admin, "arbeitsstunden", id, user);
  if (!perm.ok) return perm;
  const { error } = await ac.admin.from("arbeitsstunden").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/stundennachweis");
  return { ok: true };
}

// ===================== Mehrarbeit-Bestätigung (nur Admin) ==============
export async function setzeMehrarbeitBestaetigung(input: {
  leitungId: string;
  wocheStart: string; // YYYY-MM-DD (Montag)
  bestaetigt: boolean;
}): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };
  const woche = (input.wocheStart || "").slice(0, 10);
  if (!woche) return { ok: false, error: "Woche fehlt." };
  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  if (input.bestaetigt) {
    const { error } = await ac.admin.from("mehrarbeit_bestaetigung").upsert(
      {
        leitung_id: input.leitungId,
        woche_start: woche,
        bestaetigt_von: user.id,
        bestaetigt_am: new Date().toISOString(),
      },
      { onConflict: "leitung_id,woche_start" },
    );
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await ac.admin
      .from("mehrarbeit_bestaetigung")
      .delete()
      .eq("leitung_id", input.leitungId)
      .eq("woche_start", woche);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/stundennachweis");
  return { ok: true };
}
