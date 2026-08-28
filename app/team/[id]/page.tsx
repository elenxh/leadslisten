import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Gespraechsprotokoll, Leitung } from "@/lib/types";
import { ProtokolleClient } from "./protokolle-client";

export const dynamic = "force-dynamic";

export default async function TeamLeitungPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireLeitung();

  // SL darf nur die eigenen Protokolle sehen; Admin alle.
  if (!isAdmin(me) && me.id !== params.id) {
    redirect(`/team/${me.id}`);
  }

  const supabase = await createClient();

  const { data: leitung } = await supabase
    .from("leitungen")
    .select("id, name, kuerzel, farbe")
    .eq("id", params.id)
    .maybeSingle();

  if (!leitung) {
    notFound();
  }

  const { data: protokolle } = await supabase
    .from("gespraechsprotokolle")
    .select("*")
    .eq("leitung_id", params.id)
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <>
      <AppHeader leitung={me} />
      <ProtokolleClient
        me={me}
        owner={leitung as Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">}
        protokolle={(protokolle ?? []) as Gespraechsprotokoll[]}
      />
    </>
  );
}
