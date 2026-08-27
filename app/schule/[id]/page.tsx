import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  AnrufMitLeitung,
  Kontakt,
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

  const { data: kontakteData } = await supabase
    .from("kontakte")
    .select("*")
    .eq("schule_id", params.id)
    .order("created_at", { ascending: true });

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

  // Bearbeiten darf: Admin (überall) ODER eine Leitung, die den Standort der
  // Schule betreut (nicht mehr an "zustaendig" gebunden). Damit pflegt eine SL
  // alle Schulen ihrer Standorte.
  let standortLeitung = false;
  if (!isAdmin(me) && schuleTyped.standort_id) {
    const { data: rel } = await supabase
      .from("leitung_standort")
      .select("standort_id")
      .eq("leitung_id", me.id)
      .eq("standort_id", schuleTyped.standort_id)
      .maybeSingle();
    standortLeitung = !!rel;
  }
  const canEdit = isAdmin(me) || standortLeitung;
  const canEditSchulart = canEdit;

  // Standort-Name für die (read-only) Anzeige bei Nicht-Admins.
  let standortName: string | null = null;
  if (schuleTyped.standort_id) {
    const { data: st } = await supabase
      .from("standorte")
      .select("name")
      .eq("id", schuleTyped.standort_id)
      .maybeSingle();
    standortName = (st?.name as string | undefined) ?? null;
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
        standortName={standortName}
        kontakte={(kontakteData ?? []) as Kontakt[]}
      />
    </>
  );
}
