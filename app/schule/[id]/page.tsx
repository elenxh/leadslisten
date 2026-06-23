import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AnrufMitLeitung, Leitung, SchuleMitLeitung } from "@/lib/types";
import { SchuleDetail } from "./schule-detail";

export const dynamic = "force-dynamic";

export default async function SchulePage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireLeitung();
  const supabase = await createClient();

  const { data: schule } = await supabase
    .from("schulen")
    .select("*, leitung:zustaendig(id, name, kuerzel, farbe)")
    .eq("id", params.id)
    .single();

  if (!schule) {
    notFound();
  }

  const { data: anrufeData } = await supabase
    .from("anrufe")
    .select("*, leitung:leitung_id(id, name, kuerzel, farbe)")
    .eq("schule_id", params.id)
    .order("datum", { ascending: false });

  // Admins can reassign — load the active Leitungen for the picker.
  let leitungen: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[] = [];
  if (isAdmin(me)) {
    const { data } = await supabase
      .from("leitungen")
      .select("id, name, kuerzel, farbe")
      .eq("aktiv", true)
      .order("name");
    leitungen = (data ?? []) as typeof leitungen;
  }

  const schuleTyped = schule as unknown as SchuleMitLeitung;
  const canEdit = isAdmin(me) || schuleTyped.zustaendig === me.id;

  return (
    <>
      <AppHeader leitung={me} />
      <SchuleDetail
        schule={schuleTyped}
        anrufe={(anrufeData ?? []) as unknown as AnrufMitLeitung[]}
        me={me}
        canEdit={canEdit}
        leitungen={leitungen}
      />
    </>
  );
}
