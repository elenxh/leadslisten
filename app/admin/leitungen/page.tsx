import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Leitung } from "@/lib/types";
import { LeitungenClient } from "./leitungen-client";

export const dynamic = "force-dynamic";

export default async function LeitungenPage() {
  const me = await requireLeitung();
  if (!isAdmin(me)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const [{ data: leitungen }, { data: schulen }] = await Promise.all([
    supabase.from("leitungen").select("*").order("name"),
    supabase.from("schulen").select("zustaendig"),
  ]);

  const schulCount: Record<string, number> = {};
  for (const s of (schulen ?? []) as { zustaendig: string | null }[]) {
    if (s.zustaendig) schulCount[s.zustaendig] = (schulCount[s.zustaendig] ?? 0) + 1;
  }

  return (
    <>
      <AppHeader leitung={me} />
      <LeitungenClient
        leitungen={(leitungen ?? []) as Leitung[]}
        schulCount={schulCount}
      />
    </>
  );
}
