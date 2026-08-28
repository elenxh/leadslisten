import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Leitung, LeitungVertrag, Vertragsmodell } from "@/lib/types";
import { VertragsmodelleClient } from "./vertragsmodelle-client";

export const dynamic = "force-dynamic";

export default async function VertragsmodellePage() {
  const me = await requireLeitung();
  if (!isAdmin(me)) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: modelle }, { data: leitungen }, { data: vertraege }] =
    await Promise.all([
      supabase.from("vertragsmodelle").select("*").order("name"),
      supabase
        .from("leitungen")
        .select("id, name, kuerzel, farbe")
        .eq("rolle", "leitung")
        .eq("aktiv", true)
        .order("name"),
      supabase
        .from("leitung_vertrag")
        .select("id, leitung_id, vertragsmodell_id, gilt_ab")
        .order("gilt_ab", { ascending: false }),
    ]);

  return (
    <>
      <AppHeader leitung={me} />
      <VertragsmodelleClient
        modelle={(modelle ?? []) as Vertragsmodell[]}
        leitungen={(leitungen ?? []) as Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[]}
        vertraege={(vertraege ?? []) as Pick<LeitungVertrag, "id" | "leitung_id" | "vertragsmodell_id" | "gilt_ab">[]}
      />
    </>
  );
}
