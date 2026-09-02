"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AufgabeTyp } from "@/lib/types";

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

function revalidateAll() {
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
  revalidatePath("/stundennachweis");
}

export interface AufgabeInput {
  was: string;
  bis_wann: string; // YYYY-MM-DD
  typ: AufgabeTyp; // 'einzel' | 'gemeinsam'
  zugewiesen_an?: string | null; // Pflicht bei einzel
  kommentar_admin?: string | null;
}

/** Legt eine Aufgabe an. Admin: einzel (an beliebige SL) oder gemeinsam.
 *  SL: nur einzel für sich selbst. */
export async function createAufgabe(input: AufgabeInput): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const was = (input.was ?? "").trim();
  const bis = (input.bis_wann ?? "").slice(0, 10);
  if (!was) return { ok: false, error: "Bitte beschreiben, was zu tun ist." };
  if (!bis) return { ok: false, error: "Bitte ein Fälligkeitsdatum angeben." };

  const typ: AufgabeTyp = input.typ === "gemeinsam" ? "gemeinsam" : "einzel";
  let zugewiesen: string | null = null;
  if (typ === "einzel") {
    zugewiesen = user.isAdmin ? (input.zugewiesen_an ?? "").trim() || null : user.id;
    if (!zugewiesen) return { ok: false, error: "Bitte eine Person zuweisen." };
    if (!user.isAdmin && zugewiesen !== user.id)
      return { ok: false, error: "Als SL nur Aufgaben für dich selbst." };
  } else if (!user.isAdmin) {
    return { ok: false, error: "Gemeinsame Aufgaben legt nur der Admin an." };
  }

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { error } = await ac.admin.from("aufgaben").insert({
    was,
    bis_wann: bis,
    typ,
    zugewiesen_an: zugewiesen,
    ersteller_id: user.id,
    quelle: "manuell",
    kommentar_admin: user.isAdmin ? norm(input.kommentar_admin) : null,
  });
  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true };
}

/** Ändert Text/Frist/Admin-Kommentar. Nur Admin. */
export async function updateAufgabe(
  id: string,
  felder: { was?: string; bis_wann?: string; kommentar_admin?: string | null },
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const update: Record<string, unknown> = {};
  if (felder.was !== undefined) {
    const w = felder.was.trim();
    if (!w) return { ok: false, error: "Text darf nicht leer sein." };
    update.was = w;
  }
  if (felder.bis_wann !== undefined) {
    const b = felder.bis_wann.slice(0, 10);
    if (!b) return { ok: false, error: "Frist darf nicht leer sein." };
    update.bis_wann = b;
  }
  if (felder.kommentar_admin !== undefined)
    update.kommentar_admin = norm(felder.kommentar_admin);
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await ac.admin.from("aufgaben").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true };
}

/** SL-Kommentar (Rückfrage/Status). Zugewiesene SL (einzel) oder Admin. */
export async function setKommentarSl(id: string, text: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { data: a } = await ac.admin
    .from("aufgaben")
    .select("typ, zugewiesen_an")
    .eq("id", id)
    .single();
  if (!a) return { ok: false, error: "Aufgabe nicht gefunden." };
  const row = a as { typ: string; zugewiesen_an: string | null };
  const darf = user.isAdmin || (row.typ === "einzel" && row.zugewiesen_an === user.id);
  if (!darf) return { ok: false, error: "Keine Berechtigung." };

  const { error } = await ac.admin
    .from("aufgaben")
    .update({ kommentar_sl: norm(text) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true };
}

/** Hakt eine Aufgabe ab / wieder auf. einzel: an der Aufgabe; gemeinsam: an der
 *  eigenen Erledigungszeile. Reine Nachverfolgung — KEINE Zeitwirkung. */
export async function setAufgabeErledigt(
  id: string,
  erledigt: boolean,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { data: a } = await ac.admin
    .from("aufgaben")
    .select("typ, zugewiesen_an")
    .eq("id", id)
    .single();
  if (!a) return { ok: false, error: "Aufgabe nicht gefunden." };
  const row = a as { typ: string; zugewiesen_an: string | null };
  const stamp = erledigt ? new Date().toISOString() : null;

  if (row.typ === "gemeinsam") {
    // Eigene Erledigungszeile (lazy) upserten.
    const { error } = await ac.admin
      .from("aufgabe_erledigung")
      .upsert({ aufgabe_id: id, leitung_id: user.id, erledigt, erledigt_am: stamp });
    if (error) return { ok: false, error: error.message };
  } else {
    if (!user.isAdmin && row.zugewiesen_an !== user.id)
      return { ok: false, error: "Keine Berechtigung." };
    const { error } = await ac.admin
      .from("aufgaben")
      .update({ erledigt, erledigt_am: stamp })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  revalidateAll();
  return { ok: true };
}

/** Löscht eine Aufgabe. Admin alles; SL nur selbst erstellte eigene. */
export async function deleteAufgabe(id: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminClientOrError();
  if (!ac.ok) return ac;

  const { data: a } = await ac.admin
    .from("aufgaben")
    .select("zugewiesen_an, ersteller_id")
    .eq("id", id)
    .single();
  if (!a) return { ok: false, error: "Aufgabe nicht gefunden." };
  const row = a as { zugewiesen_an: string | null; ersteller_id: string | null };
  const darf =
    user.isAdmin || (row.zugewiesen_an === user.id && row.ersteller_id === user.id);
  if (!darf) return { ok: false, error: "Keine Berechtigung." };

  const { error } = await ac.admin.from("aufgaben").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true };
}
