import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  FarbLegende,
  Leitung,
  SchuleMitLeitung,
  Standort,
  StandortMitVorschlag,
} from "@/lib/types";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await requireLeitung();

  if (!me.passwort_geaendert) {
    redirect("/passwort-aendern");
  }

  const admin = me.rolle === "admin";
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("schulen")
    .select("*, leitung:zustaendig(id, name, kuerzel, farbe)")
    .order("wiedervorlage_am", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  const schulen = (data ?? []) as unknown as SchuleMitLeitung[];

  // Standorte für die Seitenleiste laden.
  let standorte: Standort[] = [];
  let vorgeschlagen: StandortMitVorschlag[] = [];
  let leitungen: Pick<Leitung, "id" | "name">[] = [];

  if (admin) {
    const { data: alle } = await supabase
      .from("standorte")
      .select("*, vorschlagende:vorgeschlagen_von(id, name, kuerzel, farbe)")
      .order("name");
    const list = (alle ?? []) as unknown as StandortMitVorschlag[];
    standorte = list.filter((s) => s.status === "aktiv");
    vorgeschlagen = list
      .filter((s) => s.status === "vorgeschlagen")
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

    const { data: l } = await supabase
      .from("leitungen")
      .select("id, name")
      .eq("aktiv", true)
      .order("name");
    leitungen = (l ?? []) as Pick<Leitung, "id" | "name">[];
  } else {
    // Leitung sieht nur ihre zugewiesenen (aktiven) Standorte.
    const { data: ls } = await supabase
      .from("leitung_standort")
      .select("standort:standort_id(*)")
      .eq("leitung_id", me.id);
    standorte = ((ls ?? []) as unknown as { standort: Standort | null }[])
      .map((r) => r.standort)
      .filter((s): s is Standort => !!s && s.status === "aktiv")
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  // Farb-Legenden laden (RLS: nur eigene Standorte bzw. alle für Admin).
  const { data: legendeRows } = await supabase
    .from("farb_legende")
    .select("standort_id, farbe, bezeichnung");
  const farbLegende = (legendeRows ?? []) as Pick<
    FarbLegende,
    "standort_id" | "farbe" | "bezeichnung"
  >[];

  return (
    <>
      <AppHeader leitung={me} />
      {error ? (
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-destructive">
          Schulen konnten nicht geladen werden: {error.message}
        </div>
      ) : (
        <DashboardClient
          schulen={schulen}
          me={me}
          standorte={standorte}
          vorgeschlagen={vorgeschlagen}
          leitungen={leitungen}
          farbLegende={farbLegende}
        />
      )}
    </>
  );
}
