import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Aufgabe, Gespraechsprotokoll, Leitung, SlDatei, SlOrdner } from "@/lib/types";
import { ProtokolleClient } from "./protokolle-client";
import { DateienBereich } from "./dateien-bereich";

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

  const protokolleListe = (protokolle ?? []) as Gespraechsprotokoll[];

  // Protokoll-Aufgaben (quelle='protokoll') laden + nach Protokoll gruppieren.
  const aufgabenByProtokoll: Record<string, Aufgabe[]> = {};
  const protokollIds = protokolleListe.map((p) => p.id);
  if (protokollIds.length > 0) {
    const { data: aufgabenData } = await supabase
      .from("aufgaben")
      .select("*")
      .eq("quelle", "protokoll")
      .in("protokoll_id", protokollIds)
      .order("bis_wann", { ascending: true })
      .order("created_at", { ascending: true });
    for (const a of (aufgabenData ?? []) as Aufgabe[]) {
      if (a.protokoll_id) (aufgabenByProtokoll[a.protokoll_id] ??= []).push(a);
    }
  }

  // Aktive Leitungen für die „Wer"-Auswahl (nur Admin darf frei zuweisen; SLs
  // sehen sich selbst). Für SL genügt die eigene Person.
  let leitungen: Pick<Leitung, "id" | "name">[] = [];
  if (isAdmin(me)) {
    const { data: l } = await supabase
      .from("leitungen")
      .select("id, name")
      .eq("aktiv", true)
      .order("name");
    leitungen = (l ?? []) as Pick<Leitung, "id" | "name">[];
  } else {
    leitungen = [{ id: me.id, name: me.name }];
  }

  // Datei-Ablage der SL (RLS: eigene bzw. Admin alle).
  const [{ data: ordnerData }, { data: dateiData }] = await Promise.all([
    supabase.from("sl_ordner").select("*").eq("leitung_id", params.id),
    supabase.from("sl_dateien").select("*").eq("leitung_id", params.id),
  ]);

  return (
    <>
      <AppHeader leitung={me} />
      <ProtokolleClient
        me={me}
        owner={leitung as Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">}
        protokolle={protokolleListe}
        leitungen={leitungen}
        aufgabenByProtokoll={aufgabenByProtokoll}
      />
      <div className="mx-auto max-w-3xl px-4 pb-10">
        <DateienBereich
          leitungId={params.id}
          ordner={(ordnerData ?? []) as SlOrdner[]}
          dateien={(dateiData ?? []) as SlDatei[]}
        />
      </div>
    </>
  );
}
