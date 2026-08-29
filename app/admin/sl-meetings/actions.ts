"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SimpleResult = { ok: true } | { ok: false; error: string };

async function adminUser() {
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
  if (!me || me.aktiv === false || me.rolle !== "admin") return null;
  return { id: user.id };
}

function admin() {
  return createAdminClient();
}

const norm = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

export interface RessourcenLinkInput {
  titel: string;
  url: string;
  beschreibung?: string | null;
  aktiv?: boolean;
}

function valid(f: RessourcenLinkInput): string | null {
  if (!(f.titel || "").trim()) return "Titel ist erforderlich.";
  if (!(f.url || "").trim()) return "URL ist erforderlich.";
  return null;
}

export async function createRessourcenLink(f: RessourcenLinkInput): Promise<SimpleResult> {
  const user = await adminUser();
  if (!user) return { ok: false, error: "Keine Berechtigung." };
  const err = valid(f);
  if (err) return { ok: false, error: err };

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = admin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Ans Ende sortieren.
  const { data: maxRow } = await db
    .from("ressourcen_links")
    .select("sortierung")
    .order("sortierung", { ascending: false })
    .limit(1)
    .maybeSingle();
  const naechste = ((maxRow as { sortierung: number } | null)?.sortierung ?? -1) + 1;

  const { error } = await db.from("ressourcen_links").insert({
    titel: f.titel.trim(),
    url: f.url.trim(),
    beschreibung: norm(f.beschreibung),
    aktiv: f.aktiv ?? true,
    sortierung: naechste,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/sl-meetings");
  revalidatePath("/sl-meetings");
  return { ok: true };
}

export async function updateRessourcenLink(
  id: string,
  f: RessourcenLinkInput,
): Promise<SimpleResult> {
  const user = await adminUser();
  if (!user) return { ok: false, error: "Keine Berechtigung." };
  const err = valid(f);
  if (err) return { ok: false, error: err };

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = admin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const felder: Record<string, unknown> = {
    titel: f.titel.trim(),
    url: f.url.trim(),
    beschreibung: norm(f.beschreibung),
  };
  if (typeof f.aktiv === "boolean") felder.aktiv = f.aktiv;

  const { error } = await db.from("ressourcen_links").update(felder).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/sl-meetings");
  revalidatePath("/sl-meetings");
  return { ok: true };
}

export async function deleteRessourcenLink(id: string): Promise<SimpleResult> {
  const user = await adminUser();
  if (!user) return { ok: false, error: "Keine Berechtigung." };

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = admin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error } = await db.from("ressourcen_links").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/sl-meetings");
  revalidatePath("/sl-meetings");
  return { ok: true };
}

// Reihenfolge ändern: kompletten Vektor neu durchnummerieren (robust auch bei
// gleichen Ausgangswerten).
export async function moveRessourcenLink(
  id: string,
  dir: "up" | "down",
): Promise<SimpleResult> {
  const user = await adminUser();
  if (!user) return { ok: false, error: "Keine Berechtigung." };

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = admin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { data } = await db
    .from("ressourcen_links")
    .select("id")
    .order("sortierung", { ascending: true })
    .order("created_at", { ascending: true });
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const i = ids.indexOf(id);
  if (i < 0) return { ok: false, error: "Link nicht gefunden." };
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return { ok: true }; // an den Enden: No-op

  ids.splice(j, 0, ids.splice(i, 1)[0]);
  await Promise.all(
    ids.map((lid, idx) =>
      db.from("ressourcen_links").update({ sortierung: idx }).eq("id", lid),
    ),
  );

  revalidatePath("/admin/sl-meetings");
  revalidatePath("/sl-meetings");
  return { ok: true };
}
