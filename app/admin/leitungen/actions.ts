"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Rolle } from "@/lib/types";

export interface CreateLeitungInput {
  name: string;
  email: string;
  kuerzel: string;
  farbe: string;
  region: string;
  rolle: Rolle;
}

export type ActionResult =
  | { ok: true; tempPassword: string }
  | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Nicht angemeldet." };

  const { data: me } = await supabase
    .from("leitungen")
    .select("rolle")
    .eq("id", user.id)
    .single();

  if (!me || me.rolle !== "admin") {
    return { ok: false as const, error: "Keine Berechtigung." };
  }
  return { ok: true as const };
}

function tempPassword(): string {
  // Readable temp password that satisfies common complexity rules.
  return "Tut-" + randomUUID().replace(/-/g, "").slice(0, 10);
}

export async function createLeitung(
  input: CreateLeitungInput,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const kuerzel = input.kuerzel.trim();

  if (!name) return { ok: false, error: "Name ist erforderlich." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Bitte eine gültige E-Mail angeben." };
  }
  if (!kuerzel) return { ok: false, error: "Kürzel ist erforderlich." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const password = tempPassword();

  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createErr || !created?.user) {
    return {
      ok: false,
      error: createErr?.message ?? "Auth-User konnte nicht erstellt werden.",
    };
  }

  const { error: insertErr } = await admin.from("leitungen").insert({
    id: created.user.id,
    name,
    email,
    kuerzel,
    farbe: input.farbe || null,
    region: input.region.trim() || null,
    rolle: input.rolle,
    aktiv: true,
    passwort_geaendert: false,
  });

  if (insertErr) {
    // Roll back the auth user so we don't leave an orphan.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: insertErr.message };
  }

  revalidatePath("/admin/leitungen");
  return { ok: true, tempPassword: password };
}

export async function setLeitungAktiv(
  id: string,
  aktiv: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error } = await admin
    .from("leitungen")
    .update({ aktiv })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/leitungen");
  return { ok: true };
}
