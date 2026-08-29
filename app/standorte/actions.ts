"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ringForTown } from "@/lib/berlin-ring";
import { STATUS_VALUES } from "@/lib/status";
import { ERGEBNIS_VALUES } from "@/lib/anruf";
import { todayISO } from "@/lib/dates";
import { SCHUL_MAIL_CC } from "@/lib/config";
import type { Standort } from "@/lib/types";

export type SimpleResult = { ok: true } | { ok: false; error: string };
export type CreateStandortResult =
  | { ok: true; standort: Standort }
  | { ok: false; error: string };

/** Liefert den eingeloggten User + ob er Admin ist (über RLS-Client).
 * Deaktivierte Konten (aktiv = false) gelten als NICHT angemeldet, damit auch
 * direkte Server-Action-Aufrufe mit noch gültigem Token abgewiesen werden –
 * die Actions laufen über Service-Role und würden RLS sonst umgehen. */
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

/**
 * Leitung (oder Admin) schlägt einen neuen Standort vor.
 * Der Standort wird mit status='vorgeschlagen' angelegt und muss vom Admin
 * freigeschaltet werden.
 */
export async function proposeStandort(name: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name ist erforderlich." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { error } = await ac.admin.from("standorte").insert({
    name: clean,
    status: "vorgeschlagen",
    vorgeschlagen_von: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Admin legt direkt einen aktiven Standort an (z. B. inline beim Import).
 * Gibt den angelegten Standort zurück, damit der Client ihn auswählen kann.
 */
export async function createStandort(
  name: string,
): Promise<CreateStandortResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name ist erforderlich." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { data, error } = await ac.admin
    .from("standorte")
    .insert({ name: clean, status: "aktiv" })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin/import");
  revalidatePath("/admin/leitungen");
  return { ok: true, standort: data as Standort };
}

/**
 * Admin schaltet einen vorgeschlagenen Standort frei (status='aktiv') und
 * kann ihm optional direkt Leitung(en) zuweisen.
 */
export async function approveStandort(
  id: string,
  leitungIds: string[] = [],
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { error } = await ac.admin
    .from("standorte")
    .update({ status: "aktiv" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (leitungIds.length > 0) {
    const rows = leitungIds.map((leitung_id) => ({
      leitung_id,
      standort_id: id,
    }));
    const { error: assignErr } = await ac.admin
      .from("leitung_standort")
      .upsert(rows, { onConflict: "leitung_id,standort_id" });
    if (assignErr) return { ok: false, error: assignErr.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/leitungen");
  return { ok: true };
}

/** Admin benennt einen Standort um. */
export async function renameStandort(
  id: string,
  name: string,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name darf nicht leer sein." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { error } = await ac.admin
    .from("standorte")
    .update({ name: clean })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin/leitungen");
  return { ok: true };
}

/** Admin lehnt einen vorgeschlagenen Standort ab (löscht ihn). */
export async function rejectStandort(id: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { error } = await ac.admin.from("standorte").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Admin löscht ALLE Schulen/Träger eines Standorts (für sauberen Neuimport).
 * Läuft über den SERVICE-ROLE-Client (umgeht RLS). Reihenfolge FK-sicher:
 * erst die zugehörigen Anrufe, dann die Schulen. Gibt die TATSÄCHLICH
 * gelöschte Anzahl zurück.
 */
export async function deleteSchulenByStandort(
  standortId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  // WICHTIG: Service-Role-Client (umgeht RLS) – NICHT der normale Client.
  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { data: rows, error: loadErr } = await ac.admin
    .from("schulen")
    .select("id")
    .eq("standort_id", standortId);
  if (loadErr) return { ok: false, error: loadErr.message };

  const ids = (rows ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return { ok: true, count: 0 };

  // 1) Abhängige Anrufe zuerst entfernen (FK-sicher), in Batches.
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await ac.admin
      .from("anrufe")
      .delete()
      .in("schule_id", batch);
    if (error) return { ok: false, error: error.message };
  }

  // 2) Schulen/Träger löschen und die tatsächlich gelöschten Zeilen zählen.
  const { data: deleted, error: delErr } = await ac.admin
    .from("schulen")
    .delete()
    .eq("standort_id", standortId)
    .select("id");
  if (delErr) return { ok: false, error: delErr.message };

  const count = deleted?.length ?? 0;
  if (count === 0) {
    return {
      ok: false,
      error:
        `0 von ${ids.length} Einträgen gelöscht – vermutlich greift RLS. ` +
        "Bitte sicherstellen, dass SUPABASE_SERVICE_ROLE_KEY der echte " +
        "service_role-Key ist (Supabase → Project Settings → API).",
    };
  }

  revalidatePath("/dashboard");
  return { ok: true, count };
}

/**
 * Admin setzt die Standort-Zuordnungen einer Leitung (vollständig ersetzend).
 */
export async function setLeitungStandorte(
  leitungId: string,
  standortIds: string[],
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  // Bestehende Zuordnungen löschen, dann neue setzen.
  const { error: delErr } = await ac.admin
    .from("leitung_standort")
    .delete()
    .eq("leitung_id", leitungId);
  if (delErr) return { ok: false, error: delErr.message };

  if (standortIds.length > 0) {
    const rows = standortIds.map((standort_id) => ({
      leitung_id: leitungId,
      standort_id,
    }));
    const { error: insErr } = await ac.admin
      .from("leitung_standort")
      .insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/admin/leitungen");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Admin ordnet eine einzelne Schule einem Standort zu (oder entfernt ihn). */
export async function setSchuleStandort(
  schuleId: string,
  standortId: string | null,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { error } = await ac.admin
    .from("schulen")
    .update({ standort_id: standortId })
    .eq("id", schuleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath(`/schule/${schuleId}`);
  return { ok: true };
}

/**
 * Ändert die Schulart EINER Schule.
 * Berechtigung: Admin immer; eine Leitung nur, wenn die Schule zu einem
 * Standort gehört, der ihr über leitung_standort zugeordnet ist.
 * Es wird ausschließlich die Spalte `schulart` geschrieben.
 */
export async function updateSchulart(
  schuleId: string,
  schulart: string,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  if (!user.isAdmin) {
    // Standort der Schule laden und Zugehörigkeit der Leitung prüfen.
    const { data: schule } = await ac.admin
      .from("schulen")
      .select("standort_id")
      .eq("id", schuleId)
      .single();
    if (!schule) return { ok: false, error: "Schule nicht gefunden." };
    if (!schule.standort_id) {
      return {
        ok: false,
        error: "Diese Schule gehört zu keinem deiner Standorte.",
      };
    }
    const { data: rel } = await ac.admin
      .from("leitung_standort")
      .select("standort_id")
      .eq("leitung_id", user.id)
      .eq("standort_id", schule.standort_id)
      .maybeSingle();
    if (!rel) {
      return {
        ok: false,
        error: "Keine Berechtigung für den Standort dieser Schule.",
      };
    }
  }

  const clean = schulart.trim();
  const { error } = await ac.admin
    .from("schulen")
    .update({ schulart: clean || null })
    .eq("id", schuleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath(`/schule/${schuleId}`);
  return { ok: true };
}

const MARKIERUNG_ERLAUBT = ["rot", "gelb", "gruen", "blau", "lila"];

type AdminClient = ReturnType<typeof createAdminClient>;

/** Darf der User (Leitung) diese Schule bearbeiten? Admin immer. */
async function darfSchuleBearbeiten(
  admin: AdminClient,
  userId: string,
  isAdmin: boolean,
  schuleId: string,
): Promise<SimpleResult> {
  if (isAdmin) return { ok: true };
  const { data: schule } = await admin
    .from("schulen")
    .select("standort_id")
    .eq("id", schuleId)
    .single();
  if (!schule) return { ok: false, error: "Schule nicht gefunden." };
  if (!schule.standort_id) {
    return { ok: false, error: "Diese Schule gehört zu keinem deiner Standorte." };
  }
  const { data: rel } = await admin
    .from("leitung_standort")
    .select("standort_id")
    .eq("leitung_id", userId)
    .eq("standort_id", schule.standort_id)
    .maybeSingle();
  if (!rel) {
    return { ok: false, error: "Keine Berechtigung für den Standort dieser Schule." };
  }
  return { ok: true };
}

/** Darf der User (Leitung) diesen Standort bearbeiten? Admin immer. */
async function darfStandortBearbeiten(
  admin: AdminClient,
  userId: string,
  isAdmin: boolean,
  standortId: string,
): Promise<SimpleResult> {
  if (isAdmin) return { ok: true };
  const { data: rel } = await admin
    .from("leitung_standort")
    .select("standort_id")
    .eq("leitung_id", userId)
    .eq("standort_id", standortId)
    .maybeSingle();
  if (!rel) return { ok: false, error: "Keine Berechtigung für diesen Standort." };
  return { ok: true };
}

/**
 * Setzt die Farbmarkierung einer Schule (oder entfernt sie mit null).
 * Berechtigung wie bei der Schulart: Admin immer, Leitung nur für Schulen
 * an einem ihr zugeordneten Standort.
 */
export async function updateMarkierung(
  schuleId: string,
  farbe: string | null,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const perm = await darfSchuleBearbeiten(ac.admin, user.id, user.isAdmin, schuleId);
  if (!perm.ok) return perm;

  const f = farbe && MARKIERUNG_ERLAUBT.includes(farbe) ? farbe : null;
  const { error } = await ac.admin
    .from("schulen")
    .update({ markierung_farbe: f })
    .eq("id", schuleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath(`/schule/${schuleId}`);
  return { ok: true };
}

// Zentrale Werteliste (lib/status.ts) – neue Status hier nicht duplizieren.
const STATUS_ERLAUBT = STATUS_VALUES;

// Status, die telefonischen Kontakt voraussetzen -> ein Direkt-Statuswechsel
// erzeugt automatisch einen erfolgreichen Call. "Neu"/"Nicht erreichbar" nicht.
const KONTAKT_STATUS: readonly string[] = STATUS_VALUES.filter(
  (s) => s !== "Neu" && s !== "Nicht erreichbar",
);

/**
 * Setzt den Status einer Schule. Berechtigung wie bei der Schulart:
 * Admin immer, Leitung nur für Schulen an einem ihr zugeordneten Standort.
 */
/**
 * Setzt (oder bestätigt) den Status einer Schule über die Status-Auswahl.
 * Erzeugt bei Kontakt-Status automatisch einen erfolgreichen Call
 * (ergebnis='erreicht', typ='telefonat', heute), sofern die ausführende Person
 * heute noch keinen erreicht-Eintrag für diese Schule hat (Tagessperre gegen
 * Doppelzählung). Gleicher Status darf erneut bestätigt werden (Punkt 3).
 * "Neu"/"Nicht erreichbar" lösen keinen Call aus.
 */
export async function updateStatus(
  schuleId: string,
  status: string,
  notiz?: string | null,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!STATUS_ERLAUBT.includes(status)) {
    return { ok: false, error: "Ungültiger Status." };
  }

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const perm = await darfSchuleBearbeiten(ac.admin, user.id, user.isAdmin, schuleId);
  if (!perm.ok) return perm;

  const { data: schule } = await ac.admin
    .from("schulen")
    .select("status, erstkontakt_am")
    .eq("id", schuleId)
    .single();
  const istKontakt = KONTAKT_STATUS.includes(status);
  const today = todayISO();

  const upd: Record<string, unknown> = { status };
  if (istKontakt && !schule?.erstkontakt_am) upd.erstkontakt_am = today;
  const { error } = await ac.admin.from("schulen").update(upd).eq("id", schuleId);
  if (error) return { ok: false, error: error.message };

  // Automatischer Call bei Kontakt-Status – mit Tagessperre.
  if (istKontakt) {
    const { data: heute } = await ac.admin
      .from("anrufe")
      .select("datum")
      .eq("schule_id", schuleId)
      .eq("leitung_id", user.id)
      .eq("ergebnis", "erreicht");
    const schonHeute = ((heute ?? []) as { datum: string }[]).some(
      (r) => (r.datum ?? "").slice(0, 10) === today,
    );
    if (!schonHeute) {
      // Kein generierter Fülltext mehr: ohne echte Notiz bleibt der Text leer
      // (die UI zeigt dann nur Datum + Ergebnis).
      const text = (notiz ?? "").trim() || null;
      const { error: aErr } = await ac.admin.from("anrufe").insert({
        schule_id: schuleId,
        leitung_id: user.id,
        datum: `${today}T12:00:00`,
        typ: "telefonat",
        ergebnis: "erreicht",
        status_neu: null,
        text,
      });
      if (aErr) return { ok: false, error: aErr.message };
    }
  }

  // Kontaktversuch -> erledigte Wiedervorlage leeren (zukünftige bleiben).
  if (istKontakt) await raeumeErledigteWiedervorlage(ac.admin, schuleId);

  await recomputeSchuleMarker(ac.admin, schuleId);
  revalidatePath("/dashboard");
  revalidatePath(`/schule/${schuleId}`);
  return { ok: true };
}

export interface AkquiseInput {
  status: string;
  callNotiz: string | null; // Text des Auto-Call-Verlaufseintrags
  wiedervorlage: string | null; // YYYY-MM-DD
  erstkontakt: string | null; // YYYY-MM-DD
  akquiseNotiz: string | null; // Bestand-Notiz
  zustaendig?: string | null; // nur Admin
  standort?: string | null; // nur Admin
}
export type AkquiseResult =
  | { ok: true; callErstellt: boolean }
  | { ok: false; error: string };

/**
 * Speichert die Akquise-Sektion in EINEM Zug: Status (+ automatischer Call bei
 * Kontakt-Status, auch unverändert = Bestätigung, Tagessperre max. 1×/Tag),
 * Wiedervorlage, Erstkontakt, Akquise-Notiz, (Admin) Zuständig/Standort.
 * Gibt zurück, ob ein Call erfasst wurde (für das Feedback).
 */
export async function speichereAkquise(
  schuleId: string,
  input: AkquiseInput,
): Promise<AkquiseResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!STATUS_ERLAUBT.includes(input.status)) {
    return { ok: false, error: "Ungültiger Status." };
  }

  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const perm = await darfSchuleBearbeiten(ac.admin, user.id, user.isAdmin, schuleId);
  if (!perm.ok) return perm;

  const { data: schule } = await ac.admin
    .from("schulen")
    .select("status, erstkontakt_am")
    .eq("id", schuleId)
    .single();
  const istKontakt = KONTAKT_STATUS.includes(input.status);
  const today = todayISO();
  const norm = (v: string | null) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };

  // Erstkontakt: Feldwert maßgeblich; bei erstem Kontakt-Status automatisch heute.
  let erst = input.erstkontakt || null;
  if (!erst && istKontakt && !schule?.erstkontakt_am) erst = today;

  const update: Record<string, unknown> = {
    status: input.status,
    wiedervorlage_am: input.wiedervorlage || null,
    erstkontakt_am: erst,
    akquise_notiz: norm(input.akquiseNotiz),
  };
  if (user.isAdmin) {
    update.zustaendig = input.zustaendig || null;
    update.standort_id = input.standort || null;
  }

  const { error: uErr } = await ac.admin.from("schulen").update(update).eq("id", schuleId);
  if (uErr) return { ok: false, error: uErr.message };

  // Automatischer Call bei Kontakt-Status – mit Tagessperre.
  let callErstellt = false;
  if (istKontakt) {
    const { data: heute } = await ac.admin
      .from("anrufe")
      .select("datum")
      .eq("schule_id", schuleId)
      .eq("leitung_id", user.id)
      .eq("ergebnis", "erreicht");
    const schonHeute = ((heute ?? []) as { datum: string }[]).some(
      (r) => (r.datum ?? "").slice(0, 10) === today,
    );
    if (!schonHeute) {
      // Kein generierter Fülltext mehr: ohne echte Notiz bleibt der Text leer.
      const text = (input.callNotiz ?? "").trim() || null;
      const { error: aErr } = await ac.admin.from("anrufe").insert({
        schule_id: schuleId,
        leitung_id: user.id,
        datum: `${today}T12:00:00`,
        typ: "telefonat",
        ergebnis: "erreicht",
        status_neu: null,
        text,
      });
      if (aErr) return { ok: false, error: aErr.message };
      callErstellt = true;
    }
  }

  // Kontaktversuch -> erledigte (heutige/vergangene) Wiedervorlage leeren.
  // Eine im Formular neu gesetzte ZUKÜNFTIGE Wiedervorlage bleibt bestehen.
  if (istKontakt) await raeumeErledigteWiedervorlage(ac.admin, schuleId);

  await recomputeSchuleMarker(ac.admin, schuleId);
  revalidatePath("/dashboard");
  revalidatePath(`/schule/${schuleId}`);
  return { ok: true, callErstellt };
}

/**
 * Protokolliert einen Vor-Ort-Termin als eigenen Verlaufseintrag
 * (typ='vor_ort', ergebnis=NULL). Zählt im Stundennachweis als Termin
 * (60 Min + Soll-Gewicht), nie als "erreicht"-Call. Berechtigung wie Bearbeiten.
 */
export async function protokolliereVorOrtTermin(input: {
  schuleId: string;
  datum: string; // YYYY-MM-DD
  notiz: string | null;
}): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  const datum = (input.datum || "").slice(0, 10);
  if (!datum) return { ok: false, error: "Datum ist erforderlich." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const perm = await darfSchuleBearbeiten(ac.admin, user.id, user.isAdmin, input.schuleId);
  if (!perm.ok) return perm;

  const { error } = await ac.admin.from("anrufe").insert({
    schule_id: input.schuleId,
    leitung_id: user.id,
    datum: `${datum}T12:00:00`,
    typ: "vor_ort",
    ergebnis: null,
    status_neu: null,
    text: (input.notiz ?? "").trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  await raeumeErledigteWiedervorlage(ac.admin, input.schuleId);
  await recomputeSchuleMarker(ac.admin, input.schuleId);
  revalidatePath("/dashboard");
  revalidatePath(`/schule/${input.schuleId}`);
  return { ok: true };
}

/**
 * Protokolliert eine an die Schule versendete E-Mail als eigenen
 * Verlaufseintrag (typ='mail', ergebnis=NULL) — ausgelöst vom „E-Mail (CC)"-
 * Button. Zählt im Stundennachweis als E-Mail (reine Zählung, keine Vergütung).
 * Berechtigung wie Bearbeiten.
 */
export async function protokolliereEmail(input: {
  schuleId: string;
  notiz?: string | null;
}): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;
  const perm = await darfSchuleBearbeiten(ac.admin, user.id, user.isAdmin, input.schuleId);
  if (!perm.ok) return perm;

  const today = todayISO();
  const { error } = await ac.admin.from("anrufe").insert({
    schule_id: input.schuleId,
    leitung_id: user.id,
    datum: `${today}T12:00:00`,
    typ: "mail",
    ergebnis: null,
    status_neu: null,
    text: (input.notiz ?? "").trim() || `E-Mail an die Schule (CC ${SCHUL_MAIL_CC})`,
  });
  if (error) return { ok: false, error: error.message };

  await raeumeErledigteWiedervorlage(ac.admin, input.schuleId);
  await recomputeSchuleMarker(ac.admin, input.schuleId);
  revalidatePath("/dashboard");
  revalidatePath(`/schule/${input.schuleId}`);
  return { ok: true };
}

export interface AnrufInput {
  schuleId: string;
  leitungId: string;
  datum: string; // YYYY-MM-DD (Datum des Anrufs)
  ergebnis: string; // erreicht | nicht_erreicht | rueckruf (Pflicht)
  status: string | null; // optional neuer Pipeline-Status (null = unverändert)
  wiedervorlage: string | null; // optional nächste Wiedervorlage
  notiz: string | null;
}

/**
 * Protokolliert einen Anruf: legt einen anrufe-Eintrag an, setzt Status +
 * Wiedervorlage der Schule, füllt erstkontakt_am falls leer und aktualisiert
 * letzter_anruf_am (Referenz für die Ampel). Berechtigung wie Bearbeiten.
 */
export async function protokolliereAnruf(
  input: AnrufInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!ERGEBNIS_VALUES.includes(input.ergebnis)) {
    return { ok: false, error: "Bitte ein Ergebnis wählen." };
  }
  // Status ist optional; nur wenn gesetzt, muss er gültig sein.
  const neuerStatus =
    input.status && input.status.trim() ? input.status.trim() : null;
  if (neuerStatus && !STATUS_ERLAUBT.includes(neuerStatus)) {
    return { ok: false, error: "Ungültiger Status." };
  }
  const datum = (input.datum || "").slice(0, 10);
  if (!datum) return { ok: false, error: "Datum ist erforderlich." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const perm = await darfSchuleBearbeiten(
    ac.admin,
    user.id,
    user.isAdmin,
    input.schuleId,
  );
  if (!perm.ok) return perm;

  const { data: schule } = await ac.admin
    .from("schulen")
    .select("erstkontakt_am, letzter_anruf_am")
    .eq("id", input.schuleId)
    .single();

  // Anruf-Eintrag (Mittagszeit, damit das Datum zeitzonen-stabil bleibt).
  const { error: aErr } = await ac.admin.from("anrufe").insert({
    schule_id: input.schuleId,
    leitung_id: input.leitungId,
    datum: `${datum}T12:00:00`,
    typ: "telefonat",
    ergebnis: input.ergebnis,
    status_neu: neuerStatus,
    text: (input.notiz ?? "").trim() || null,
  });
  if (aErr) return { ok: false, error: aErr.message };

  // Schul-Felder, die NICHT aus dem Verlauf abgeleitet sind:
  const update: Record<string, unknown> = {};
  // Status nur ändern, wenn explizit gewählt ("nicht erreicht" ändert nichts).
  if (neuerStatus) update.status = neuerStatus;
  // Wiedervorlage nur setzen, wenn angegeben (sonst bestehende beibehalten).
  if (input.wiedervorlage) update.wiedervorlage_am = input.wiedervorlage;
  if (!schule?.erstkontakt_am) update.erstkontakt_am = datum;
  if (Object.keys(update).length > 0) {
    const { error: sErr } = await ac.admin
      .from("schulen")
      .update(update)
      .eq("id", input.schuleId);
    if (sErr) return { ok: false, error: sErr.message };
  }

  // Erledigte Wiedervorlage leeren – aber nur, wenn im Dialog KEINE neue
  // Wiedervorlage gesetzt wurde (die hätte Vorrang und bleibt bestehen).
  if (!input.wiedervorlage) {
    await raeumeErledigteWiedervorlage(ac.admin, input.schuleId);
  }

  // Abgeleitete Felder (Marker + Ampel-Referenz) frisch aus dem Verlauf.
  await recomputeSchuleMarker(ac.admin, input.schuleId);

  revalidatePath("/dashboard");
  revalidatePath(`/schule/${input.schuleId}`);
  return { ok: true };
}

/**
 * Nach einem protokollierten Kontaktversuch (Anruf/Status/E-Mail): eine
 * ERLEDIGTE Wiedervorlage (Datum heute oder in der Vergangenheit) automatisch
 * leeren – sie gilt als abgearbeitet; die SL setzt bei Bedarf eine neue.
 * ZUKÜNFTIGE Wiedervorlagen bleiben unberührt (geparkt). Ein einziges
 * bedingtes UPDATE, kein Read nötig.
 */
async function raeumeErledigteWiedervorlage(
  admin: ReturnType<typeof createAdminClient>,
  schuleId: string,
): Promise<void> {
  await admin
    .from("schulen")
    .update({ wiedervorlage_am: null })
    .eq("id", schuleId)
    .not("wiedervorlage_am", "is", null)
    .lte("wiedervorlage_am", todayISO());
}

/**
 * Berechnet die aus dem Verlauf abgeleiteten Schul-Felder neu und schreibt sie:
 * - letztes_ergebnis           = Ergebnis des jüngsten Anrufs
 * - nicht_erreicht_serie       = führende "nicht erreicht" seit letztem Erfolg
 * - letzter_anruf_am (Ampel)   = jüngstes Anruf-Datum (oder NULL)
 * Robust bei rückdatierten Einträgen; nach Anlegen/Ändern/Löschen aufrufen.
 */
async function recomputeSchuleMarker(
  admin: AdminClient,
  schuleId: string,
): Promise<void> {
  const { data } = await admin
    .from("anrufe")
    .select("ergebnis, datum")
    .eq("schule_id", schuleId)
    .order("datum", { ascending: false })
    .order("id", { ascending: false });
  const rows = (data ?? []) as { ergebnis: string | null; datum: string }[];

  const letztesErgebnis = rows[0]?.ergebnis ?? null;
  let serie = 0;
  for (const r of rows) {
    if (r.ergebnis === "nicht_erreicht") serie++;
    else break;
  }
  const letzterAnruf = rows[0]?.datum ? rows[0].datum.slice(0, 10) : null;

  await admin
    .from("schulen")
    .update({
      letztes_ergebnis: letztesErgebnis,
      nicht_erreicht_serie: serie,
      letzter_anruf_am: letzterAnruf,
    })
    .eq("id", schuleId);
}

export interface SchuleFelder {
  name?: string;
  schulart?: string | null;
  bezirk?: string | null;
  stadt?: string | null;
  adresse?: string | null;
  homepage?: string | null;
  ansprechpartner?: string | null;
  rolle_ap?: string | null;
  mail?: string | null;
  tel?: string | null;
  status?: string;
  erstkontakt_am?: string | null;
  wiedervorlage_am?: string | null;
  akquise_notiz?: string | null;
  notiz_original?: string | null; // Ursprungsnotiz (Import-Rohtext), frei editierbar
  zustaendig?: string | null; // nur Admin
  standort_id?: string | null; // nur Admin
}

/**
 * Bearbeitet die Stammdaten/Akquise-Felder einer Schule. Admin überall, SL nur
 * für Schulen eines eigenen Standorts (darfSchuleBearbeiten). zustaendig und
 * standort_id werden NUR für Admins geschrieben (zusätzlich per DB-Trigger
 * gegen Umgehung abgesichert).
 */
export async function updateSchuleFelder(
  schuleId: string,
  felder: SchuleFelder,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const perm = await darfSchuleBearbeiten(ac.admin, user.id, user.isAdmin, schuleId);
  if (!perm.ok) return perm;

  const norm = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };
  const update: Record<string, unknown> = {};

  if (felder.name !== undefined) {
    const n = (felder.name ?? "").trim();
    if (!n) return { ok: false, error: "Name ist erforderlich." };
    update.name = n;
  }
  if (felder.schulart !== undefined) update.schulart = norm(felder.schulart);
  if (felder.bezirk !== undefined) update.bezirk = norm(felder.bezirk);
  if (felder.stadt !== undefined) {
    update.stadt = norm(felder.stadt);
    update.ring = ringForTown(norm(felder.stadt)); // Berlin-Ring konsistent halten
  }
  if (felder.adresse !== undefined) update.adresse = norm(felder.adresse);
  if (felder.homepage !== undefined) update.homepage = norm(felder.homepage);
  if (felder.ansprechpartner !== undefined)
    update.ansprechpartner = norm(felder.ansprechpartner);
  if (felder.rolle_ap !== undefined) update.rolle_ap = norm(felder.rolle_ap);
  if (felder.mail !== undefined) update.mail = norm(felder.mail);
  if (felder.tel !== undefined) update.tel = norm(felder.tel);
  if (felder.status !== undefined) {
    if (!STATUS_ERLAUBT.includes(felder.status)) {
      return { ok: false, error: "Ungültiger Status." };
    }
    update.status = felder.status;
  }
  if (felder.erstkontakt_am !== undefined)
    update.erstkontakt_am = felder.erstkontakt_am || null;
  if (felder.wiedervorlage_am !== undefined)
    update.wiedervorlage_am = felder.wiedervorlage_am || null;
  if (felder.akquise_notiz !== undefined)
    update.akquise_notiz = (felder.akquise_notiz ?? "").trim() || null;
  // Ursprungsnotiz frei editier-/leerbar. NUR notiz_original – das Backup
  // notiz_original_backup (0013) wird hier bewusst NIE angefasst.
  if (felder.notiz_original !== undefined)
    update.notiz_original = (felder.notiz_original ?? "").trim() || null;

  // NUR Admin darf Zuständigkeit/Standort ändern.
  if (user.isAdmin) {
    if (felder.zustaendig !== undefined)
      update.zustaendig = felder.zustaendig || null;
    if (felder.standort_id !== undefined)
      update.standort_id = felder.standort_id || null;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await ac.admin
    .from("schulen")
    .update(update)
    .eq("id", schuleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath(`/schule/${schuleId}`);
  return { ok: true };
}

export interface AnrufUpdateInput {
  text?: string | null;
  datum?: string | null; // YYYY-MM-DD
  ergebnis?: string | null; // erreicht | nicht_erreicht | rueckruf | null
}

/** Bearbeitet einen Verlaufseintrag (Text/Datum/Ergebnis). Status bleibt außen
 * vor – der Schul-Status wird nur über die Status-Auswahl der Schule gesetzt. */
export async function updateAnruf(
  anrufId: string,
  felder: AnrufUpdateInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { data: anruf } = await ac.admin
    .from("anrufe")
    .select("schule_id")
    .eq("id", anrufId)
    .single();
  if (!anruf) return { ok: false, error: "Eintrag nicht gefunden." };

  const perm = await darfSchuleBearbeiten(
    ac.admin,
    user.id,
    user.isAdmin,
    anruf.schule_id as string,
  );
  if (!perm.ok) return perm;

  const update: Record<string, unknown> = {};
  if (felder.text !== undefined) update.text = (felder.text ?? "").trim() || null;
  if (felder.datum) update.datum = `${felder.datum.slice(0, 10)}T12:00:00`;
  if (felder.ergebnis !== undefined) {
    if (felder.ergebnis && !ERGEBNIS_VALUES.includes(felder.ergebnis)) {
      return { ok: false, error: "Ungültiges Ergebnis." };
    }
    update.ergebnis = felder.ergebnis || null;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await ac.admin
    .from("anrufe")
    .update(update)
    .eq("id", anrufId);
  if (error) return { ok: false, error: error.message };

  await recomputeSchuleMarker(ac.admin, anruf.schule_id as string);
  revalidatePath("/dashboard");
  revalidatePath(`/schule/${anruf.schule_id}`);
  return { ok: true };
}

/** Löscht einen Verlaufseintrag. Admin überall, SL nur für eigene Standorte. */
export async function deleteAnruf(anrufId: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { data: anruf } = await ac.admin
    .from("anrufe")
    .select("schule_id")
    .eq("id", anrufId)
    .single();
  if (!anruf) return { ok: false, error: "Eintrag nicht gefunden." };

  const perm = await darfSchuleBearbeiten(
    ac.admin,
    user.id,
    user.isAdmin,
    anruf.schule_id as string,
  );
  if (!perm.ok) return perm;

  const { error } = await ac.admin.from("anrufe").delete().eq("id", anrufId);
  if (error) return { ok: false, error: error.message };

  await recomputeSchuleMarker(ac.admin, anruf.schule_id as string);
  revalidatePath("/dashboard");
  revalidatePath(`/schule/${anruf.schule_id}`);
  return { ok: true };
}

/** Admin oder betreuende Standort-Leitung löscht eine Schule endgültig. */
export async function deleteSchule(schuleId: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  // Löschen ist ausschließlich Admin vorbehalten; Standortleitungen dürfen
  // Einträge anlegen und bearbeiten, aber nicht löschen.
  if (!user.isAdmin) {
    return { ok: false, error: "Löschen ist nur Admins erlaubt." };
  }

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  // Anrufe zuerst (FK-sicher); kontakte hängen per ON DELETE CASCADE.
  const { error: aErr } = await ac.admin
    .from("anrufe")
    .delete()
    .eq("schule_id", schuleId);
  if (aErr) return { ok: false, error: aErr.message };

  const { error } = await ac.admin.from("schulen").delete().eq("id", schuleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

export interface CreateSchuleInput {
  name: string;
  schulart: string | null;
  bezirk: string | null;
  homepage: string | null;
  adresse: string | null;
  ansprechpartner: string | null;
  rolle_ap: string | null;
  tel: string | null;
  mail: string | null;
  status: string;
  erstkontakt_am: string | null;
  wiedervorlage_am: string | null;
  standortId: string | null;
  zustaendig: string | null;
  typ: "schule" | "traeger";
}

/**
 * Legt eine neue Schule/Träger an. Berechtigung: Admin immer; Leitung nur für
 * einen ihr zugeordneten Standort. Stadt/Ring werden aus dem Bezirk abgeleitet.
 */
export async function createSchule(
  input: CreateSchuleInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name ist erforderlich." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const standortId = input.standortId || null;
  if (standortId) {
    const perm = await darfStandortBearbeiten(
      ac.admin,
      user.id,
      user.isAdmin,
      standortId,
    );
    if (!perm.ok) return perm;
  } else if (!user.isAdmin) {
    return { ok: false, error: "Bitte einen Standort wählen." };
  }

  const norm = (v: string | null) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };
  const bezirk = norm(input.bezirk);
  const stadt = bezirk ? bezirk.split(/[,/]/)[0]?.trim() || null : null;
  const ring = ringForTown(stadt);
  const status = STATUS_ERLAUBT.includes(input.status) ? input.status : "Neu";
  const typ = input.typ === "traeger" ? "traeger" : "schule";

  const { data, error } = await ac.admin
    .from("schulen")
    .insert({
      name,
      schulart: norm(input.schulart),
      bezirk,
      stadt,
      ring,
      homepage: norm(input.homepage),
      adresse: norm(input.adresse),
      ansprechpartner: norm(input.ansprechpartner),
      rolle_ap: norm(input.rolle_ap),
      tel: norm(input.tel),
      mail: norm(input.mail),
      status,
      erstkontakt_am: input.erstkontakt_am || null,
      wiedervorlage_am: input.wiedervorlage_am || null,
      standort_id: standortId,
      zustaendig: input.zustaendig || null,
      typ,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true, id: (data as { id: string }).id };
}

export interface KontaktdatenInput {
  ansprechpartner: string | null;
  rolle_ap: string | null;
  tel: string | null;
  mail: string | null;
  homepage: string | null;
  adresse: string | null;
}

/**
 * Aktualisiert die Kontakt-/Stammdaten EINER Schule. Berechtigung wie
 * Schulart/Status: Admin immer, Leitung nur für eigene Standort-Schulen.
 */
export async function updateKontaktdaten(
  schuleId: string,
  felder: KontaktdatenInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const perm = await darfSchuleBearbeiten(ac.admin, user.id, user.isAdmin, schuleId);
  if (!perm.ok) return perm;

  const norm = (v: string | null) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };
  const { error } = await ac.admin
    .from("schulen")
    .update({
      ansprechpartner: norm(felder.ansprechpartner),
      rolle_ap: norm(felder.rolle_ap),
      tel: norm(felder.tel),
      mail: norm(felder.mail),
      homepage: norm(felder.homepage),
      adresse: norm(felder.adresse),
    })
    .eq("id", schuleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/schule/${schuleId}`);
  return { ok: true };
}

export interface KontaktInput {
  name: string;
  rolle: string | null;
  telefon: string | null;
  email: string | null;
  notiz: string | null;
}

function normKontakt(input: KontaktInput) {
  const norm = (v: string | null) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };
  return {
    name: input.name.trim(),
    rolle: norm(input.rolle),
    telefon: norm(input.telefon),
    email: norm(input.email),
    notiz: norm(input.notiz),
  };
}

/** Fügt einer Schule einen weiteren Ansprechpartner hinzu. */
export async function addKontakt(
  schuleId: string,
  input: KontaktInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!input.name.trim()) return { ok: false, error: "Name ist erforderlich." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const perm = await darfSchuleBearbeiten(ac.admin, user.id, user.isAdmin, schuleId);
  if (!perm.ok) return perm;

  const { error } = await ac.admin
    .from("kontakte")
    .insert({ schule_id: schuleId, ...normKontakt(input) });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/schule/${schuleId}`);
  return { ok: true };
}

/** Prüft Berechtigung über die zum Kontakt gehörende Schule. */
async function darfKontaktBearbeiten(
  admin: AdminClient,
  userId: string,
  isAdmin: boolean,
  kontaktId: string,
): Promise<{ ok: true; schuleId: string } | { ok: false; error: string }> {
  const { data: k } = await admin
    .from("kontakte")
    .select("schule_id")
    .eq("id", kontaktId)
    .single();
  if (!k) return { ok: false, error: "Kontakt nicht gefunden." };
  const perm = await darfSchuleBearbeiten(admin, userId, isAdmin, k.schule_id);
  if (!perm.ok) return perm;
  return { ok: true, schuleId: k.schule_id };
}

/** Bearbeitet einen Ansprechpartner. */
export async function updateKontakt(
  kontaktId: string,
  input: KontaktInput,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!input.name.trim()) return { ok: false, error: "Name ist erforderlich." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const perm = await darfKontaktBearbeiten(ac.admin, user.id, user.isAdmin, kontaktId);
  if (!perm.ok) return perm;

  const { error } = await ac.admin
    .from("kontakte")
    .update(normKontakt(input))
    .eq("id", kontaktId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/schule/${perm.schuleId}`);
  return { ok: true };
}

/** Löscht einen Ansprechpartner. */
export async function deleteKontakt(kontaktId: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const perm = await darfKontaktBearbeiten(ac.admin, user.id, user.isAdmin, kontaktId);
  if (!perm.ok) return perm;

  const { error } = await ac.admin.from("kontakte").delete().eq("id", kontaktId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/schule/${perm.schuleId}`);
  return { ok: true };
}

/**
 * Speichert die Farb-Legende (Bezeichnungen der 5 Farben) eines Standorts.
 * Berechtigung: Admin immer, Leitung nur für eigene Standorte.
 */
export async function saveFarbLegende(
  standortId: string,
  entries: { farbe: string; bezeichnung: string }[],
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const perm = await darfStandortBearbeiten(
    ac.admin,
    user.id,
    user.isAdmin,
    standortId,
  );
  if (!perm.ok) return perm;

  const rows = entries
    .filter((e) => MARKIERUNG_ERLAUBT.includes(e.farbe))
    .map((e) => ({
      standort_id: standortId,
      farbe: e.farbe,
      bezeichnung: (e.bezeichnung ?? "").trim(),
    }));

  if (rows.length > 0) {
    const { error } = await ac.admin
      .from("farb_legende")
      .upsert(rows, { onConflict: "standort_id,farbe" });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export type BulkResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/** Admin weist mehreren Schulen gleichzeitig einen Standort zu. */
export async function bulkSetSchulenStandort(
  schuleIds: string[],
  standortId: string | null,
): Promise<BulkResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  const ids = Array.from(new Set(schuleIds.filter(Boolean)));
  if (ids.length === 0) return { ok: false, error: "Keine Schulen ausgewählt." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { error } = await ac.admin
    .from("schulen")
    .update({ standort_id: standortId })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true, count: ids.length };
}

/** Admin weist mehreren Schulen gleichzeitig eine zuständige Leitung zu. */
export async function bulkSetSchulenLeitung(
  schuleIds: string[],
  leitungId: string | null,
): Promise<BulkResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  const ids = Array.from(new Set(schuleIds.filter(Boolean)));
  if (ids.length === 0) return { ok: false, error: "Keine Schulen ausgewählt." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { error } = await ac.admin
    .from("schulen")
    .update({ zustaendig: leitungId })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true, count: ids.length };
}
