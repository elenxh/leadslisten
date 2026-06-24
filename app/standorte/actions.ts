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
