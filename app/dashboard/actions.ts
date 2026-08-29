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

// Info-Nachricht an alle SLs veröffentlichen (nur Admin).
export async function createBroadcast(nachricht: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };
  const text = nachricht.trim();
  if (!text) return { ok: false, error: "Nachricht ist leer." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error } = await admin
    .from("broadcasts")
    .insert({ nachricht: text, created_by: user.id });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

// Info-Nachricht löschen (nur Admin).
export async function deleteBroadcast(id: string): Promise<SimpleResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  if (!user.isAdmin) return { ok: false, error: "Keine Berechtigung." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error } = await admin.from("broadcasts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
