import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Leitung } from "@/lib/types";

/**
 * Returns the currently authenticated Leitung profile, or redirects to /login.
 * Use in server components / pages that require authentication.
 */
export async function requireLeitung(): Promise<Leitung> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: leitung } = await supabase
    .from("leitungen")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!leitung) {
    // Authenticated in Supabase Auth, but no matching profile row.
    redirect("/login?error=kein-profil");
  }

  return leitung as Leitung;
}

export function isAdmin(leitung: Pick<Leitung, "rolle">): boolean {
  return leitung.rolle === "admin";
}
