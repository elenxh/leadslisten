import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Leitung } from "@/lib/types";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const me = await requireLeitung();
  if (!isAdmin(me)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("leitungen")
    .select("id, name, kuerzel, farbe")
    .eq("aktiv", true)
    .order("name");

  const leitungen = (data ?? []) as Pick<
    Leitung,
    "id" | "name" | "kuerzel" | "farbe"
  >[];

  return (
    <>
      <AppHeader leitung={me} />
      <ImportClient leitungen={leitungen} />
    </>
  );
}
