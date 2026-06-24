import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Leitung, Standort } from "@/lib/types";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const me = await requireLeitung();
  if (!isAdmin(me)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [{ data: leitungenData }, { data: standorteData }] = await Promise.all([
    supabase
      .from("leitungen")
      .select("id, name, kuerzel, farbe")
      .eq("aktiv", true)
      .order("name"),
    supabase.from("standorte").select("*").eq("status", "aktiv").order("name"),
  ]);

  const leitungen = (leitungenData ?? []) as Pick<
    Leitung,
    "id" | "name" | "kuerzel" | "farbe"
  >[];

  return (
    <>
      <AppHeader leitung={me} />
      <ImportClient
        leitungen={leitungen}
        standorte={(standorteData ?? []) as Standort[]}
      />
    </>
  );
}
