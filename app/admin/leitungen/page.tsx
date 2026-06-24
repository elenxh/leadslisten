import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Leitung, LeitungStandort, Standort } from "@/lib/types";
import { LeitungenClient } from "./leitungen-client";

export const dynamic = "force-dynamic";

export default async function LeitungenPage() {
  const me = await requireLeitung();
  if (!isAdmin(me)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const [
    { data: leitungen },
    { data: schulen },
    { data: standorte },
    { data: zuordnungen },
  ] = await Promise.all([
    supabase.from("leitungen").select("*").order("name"),
    supabase.from("schulen").select("zustaendig"),
    supabase.from("standorte").select("*").eq("status", "aktiv").order("name"),
    supabase.from("leitung_standort").select("leitung_id, standort_id"),
  ]);

  const schulCount: Record<string, number> = {};
  for (const s of (schulen ?? []) as { zustaendig: string | null }[]) {
    if (s.zustaendig) schulCount[s.zustaendig] = (schulCount[s.zustaendig] ?? 0) + 1;
  }

  // leitung_id -> standort_id[]
  const standortMap: Record<string, string[]> = {};
  for (const z of (zuordnungen ?? []) as LeitungStandort[]) {
    (standortMap[z.leitung_id] ??= []).push(z.standort_id);
  }

  return (
    <>
      <AppHeader leitung={me} />
      <LeitungenClient
        leitungen={(leitungen ?? []) as Leitung[]}
        schulCount={schulCount}
        standorte={(standorte ?? []) as Standort[]}
        standortMap={standortMap}
      />
    </>
  );
}
