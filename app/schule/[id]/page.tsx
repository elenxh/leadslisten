import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  AnrufMitLeitung,
  Leitung,
  SchuleMitLeitung,
  Standort,
} from "@/lib/types";
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

  // Admins can reassign — load the active Leitungen and Standorte for the pickers.
  let leitungen: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[] = [];
  let standorte: Standort[] = [];
  if (isAdmin(me)) {
    const [{ data: l }, { data: s }] = await Promise.all([
      supabase
        .from("leitungen")
        .select("id, name, kuerzel, farbe")
        .eq("aktiv", true)
        .order("name"),
      supabase
        .from("standorte")
        .select("*")
        .eq("status", "aktiv")
        .order("name"),
    ]);
    leitungen = (l ?? []) as typeof leitungen;
    standorte = (s ?? []) as Standort[];
  }

  const schuleTyped = schule as unknown as SchuleMitLeitung;
  const canEdit = isAdmin(me) || schuleTyped.zustaendig === me.id;

  // Schulart darf eine Leitung nur ändern, wenn die Schule zu einem ihrer
  // betreuten Standorte gehört (Admin immer).
  let canEditSchulart = isAdmin(me);
  if (!canEditSchulart && schuleTyped.standort_id) {
    const { data: rel } = await supabase
      .from("leitung_standort")
      .select("standort_id")
      .eq("leitung_id", me.id)
      .eq("standort_id", schuleTyped.standort_id)
      .maybeSingle();
    canEditSchulart = !!rel;
  }

  return (
    <>
      <AppHeader leitung={me} />
      <SchuleDetail
        schule={schuleTyped}
        anrufe={(anrufeData ?? []) as unknown as AnrufMitLeitung[]}
        me={me}
        canEdit={canEdit}
        canEditSchulart={canEditSchulart}
        leitungen={leitungen}
        standorte={standorte}
      />
    </>
  );
}
