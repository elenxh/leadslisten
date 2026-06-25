"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Standort } from "@/lib/types";

export type SimpleResult = { ok: true } | { ok: false; error: string };
export type CreateStandortResult =
  | { ok: true; standort: Standort }
  | { ok: false; error: string };

/** Liefert den eingeloggten User + ob er Admin ist (über RLS-Client). */
async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase
    .from("leitungen")
    .select("rolle")
    .eq("id", user.id)
    .single();
  return { id: user.id, isAdmin: me?.rolle === "admin" };
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

const STATUS_ERLAUBT = [
  "Neu",
  "Nicht erreichbar",
  "Erstkontakt",
  "Dokumente verschickt",
  "Persönliches Kennenlernen",
  "Kooperationsabschluss",
  "Wiedervorlage Anruf",
  "Kein Interesse",
  "Anderer Anbieter",
];

/**
 * Setzt den Status einer Schule. Berechtigung wie bei der Schulart:
 * Admin immer, Leitung nur für Schulen an einem ihr zugeordneten Standort.
 */
export async function updateStatus(
  schuleId: string,
  status: string,
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

  const { error } = await ac.admin
    .from("schulen")
    .update({ status })
    .eq("id", schuleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath(`/schule/${schuleId}`);
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
