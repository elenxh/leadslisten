"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DATEIEN_BUCKET,
  MAX_DATEI_BYTES,
  typErlaubt,
} from "@/lib/dateien";

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

function adminOrError():
  | { ok: true; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; error: string } {
  try {
    return { ok: true, admin: createAdminClient() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Zugriff auf den Baum EINER SL: Admin immer, sonst nur die eigene.
function darf(user: { id: string; isAdmin: boolean }, leitungId: string) {
  return user.isAdmin || user.id === leitungId;
}

// ---- Ordner ----------------------------------------------------------
export async function erstelleOrdner(
  leitungId: string,
  parentId: string | null,
  name: string,
): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!darf(user, leitungId)) return { ok: false, error: "Keine Berechtigung." };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Bitte einen Ordnernamen angeben." };

  const ac = adminOrError();
  if (!ac.ok) return ac;

  // parent (falls gesetzt) muss zur selben SL gehören.
  if (parentId) {
    const { data: p } = await ac.admin
      .from("sl_ordner")
      .select("leitung_id")
      .eq("id", parentId)
      .single();
    if (!p || (p as { leitung_id: string }).leitung_id !== leitungId)
      return { ok: false, error: "Ungültiger Zielordner." };
  }

  const { error } = await ac.admin
    .from("sl_ordner")
    .insert({ leitung_id: leitungId, parent_id: parentId, name: clean });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/team/${leitungId}`);
  return { ok: true };
}

export async function benenneOrdnerUm(ordnerId: string, name: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Bitte einen Ordnernamen angeben." };

  const ac = adminOrError();
  if (!ac.ok) return ac;

  const { data: o } = await ac.admin
    .from("sl_ordner")
    .select("leitung_id")
    .eq("id", ordnerId)
    .single();
  if (!o) return { ok: false, error: "Ordner nicht gefunden." };
  const leitungId = (o as { leitung_id: string }).leitung_id;
  if (!darf(user, leitungId)) return { ok: false, error: "Keine Berechtigung." };

  const { error } = await ac.admin
    .from("sl_ordner")
    .update({ name: clean })
    .eq("id", ordnerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/team/${leitungId}`);
  return { ok: true };
}

// Ordner + alle Unterordner + alle enthaltenen Dateien löschen (inkl. Storage).
export async function loescheOrdner(ordnerId: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminOrError();
  if (!ac.ok) return ac;

  const { data: o } = await ac.admin
    .from("sl_ordner")
    .select("leitung_id")
    .eq("id", ordnerId)
    .single();
  if (!o) return { ok: false, error: "Ordner nicht gefunden." };
  const leitungId = (o as { leitung_id: string }).leitung_id;
  if (!darf(user, leitungId)) return { ok: false, error: "Keine Berechtigung." };

  // Alle Nachfahren-Ordner iterativ einsammeln.
  const alleOrdner = [ordnerId];
  let grenze = [ordnerId];
  while (grenze.length > 0) {
    const { data: kinder } = await ac.admin
      .from("sl_ordner")
      .select("id")
      .in("parent_id", grenze);
    const ids = ((kinder ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) break;
    alleOrdner.push(...ids);
    grenze = ids;
  }

  // Storage-Objekte aller Dateien in diesen Ordnern entfernen.
  const { data: dateien } = await ac.admin
    .from("sl_dateien")
    .select("storage_pfad")
    .in("ordner_id", alleOrdner);
  const pfade = ((dateien ?? []) as { storage_pfad: string }[]).map((d) => d.storage_pfad);
  if (pfade.length > 0) {
    await ac.admin.storage.from(DATEIEN_BUCKET).remove(pfade);
  }

  // Wurzel löschen -> Unterordner + Datei-Metadaten kaskadieren.
  const { error } = await ac.admin.from("sl_ordner").delete().eq("id", ordnerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/team/${leitungId}`);
  return { ok: true };
}

// ---- Dateien ---------------------------------------------------------
export type UploadUrlResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string };

// Signierte Upload-URL ausstellen (nach Rechteprüfung). Der Pfad wird
// serverseitig festgelegt: {leitung_id}/{uuid}.
export async function erstelleUploadUrl(
  leitungId: string,
  dateiname: string,
  groesse: number,
  mimeType: string | null,
): Promise<UploadUrlResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!darf(user, leitungId)) return { ok: false, error: "Keine Berechtigung." };
  if (!dateiname.trim()) return { ok: false, error: "Ungültiger Dateiname." };
  if (!(groesse > 0)) return { ok: false, error: "Leere Datei." };
  if (groesse > MAX_DATEI_BYTES)
    return { ok: false, error: "Datei zu groß (max. 20 MB)." };
  if (!typErlaubt(mimeType, dateiname))
    return { ok: false, error: "Dateityp nicht erlaubt." };

  const ac = adminOrError();
  if (!ac.ok) return ac;

  const path = `${leitungId}/${crypto.randomUUID()}`;
  const { data, error } = await ac.admin.storage
    .from(DATEIEN_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Upload-URL fehlgeschlagen." };

  return { ok: true, path: data.path, token: data.token };
}

// Metadaten nach erfolgreichem Browser-Upload eintragen (erneute Prüfung).
export async function registriereDatei(input: {
  leitungId: string;
  ordnerId: string | null;
  dateiname: string;
  storagePfad: string;
  groesse: number;
  mimeType: string | null;
}): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!darf(user, input.leitungId)) return { ok: false, error: "Keine Berechtigung." };
  if (input.groesse > MAX_DATEI_BYTES) return { ok: false, error: "Datei zu groß (max. 20 MB)." };
  if (!typErlaubt(input.mimeType, input.dateiname))
    return { ok: false, error: "Dateityp nicht erlaubt." };
  // Pfad muss im eigenen Bereich liegen.
  if (!input.storagePfad.startsWith(`${input.leitungId}/`))
    return { ok: false, error: "Ungültiger Pfad." };

  const ac = adminOrError();
  if (!ac.ok) return ac;

  if (input.ordnerId) {
    const { data: o } = await ac.admin
      .from("sl_ordner")
      .select("leitung_id")
      .eq("id", input.ordnerId)
      .single();
    if (!o || (o as { leitung_id: string }).leitung_id !== input.leitungId)
      return { ok: false, error: "Ungültiger Ordner." };
  }

  const { error } = await ac.admin.from("sl_dateien").insert({
    leitung_id: input.leitungId,
    ordner_id: input.ordnerId,
    dateiname: input.dateiname.trim(),
    storage_pfad: input.storagePfad,
    groesse: input.groesse,
    mime_type: input.mimeType,
    hochgeladen_von: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/team/${input.leitungId}`);
  return { ok: true };
}

export type DownloadResult = { ok: true; url: string } | { ok: false; error: string };

export async function erstelleDownloadUrl(dateiId: string): Promise<DownloadResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminOrError();
  if (!ac.ok) return ac;

  const { data: d } = await ac.admin
    .from("sl_dateien")
    .select("leitung_id, storage_pfad, dateiname")
    .eq("id", dateiId)
    .single();
  if (!d) return { ok: false, error: "Datei nicht gefunden." };
  const row = d as { leitung_id: string; storage_pfad: string; dateiname: string };
  if (!darf(user, row.leitung_id)) return { ok: false, error: "Keine Berechtigung." };

  const { data: signed, error } = await ac.admin.storage
    .from(DATEIEN_BUCKET)
    .createSignedUrl(row.storage_pfad, 120, { download: row.dateiname });
  if (error || !signed) return { ok: false, error: error?.message ?? "Link fehlgeschlagen." };

  return { ok: true, url: signed.signedUrl };
}

export async function loescheDatei(dateiId: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const ac = adminOrError();
  if (!ac.ok) return ac;

  const { data: d } = await ac.admin
    .from("sl_dateien")
    .select("leitung_id, storage_pfad")
    .eq("id", dateiId)
    .single();
  if (!d) return { ok: false, error: "Datei nicht gefunden." };
  const row = d as { leitung_id: string; storage_pfad: string };
  if (!darf(user, row.leitung_id)) return { ok: false, error: "Keine Berechtigung." };

  await ac.admin.storage.from(DATEIEN_BUCKET).remove([row.storage_pfad]);
  const { error } = await ac.admin.from("sl_dateien").delete().eq("id", dateiId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/team/${row.leitung_id}`);
  return { ok: true };
}
