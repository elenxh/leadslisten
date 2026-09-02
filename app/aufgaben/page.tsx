import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { Aufgabe, Leitung } from "@/lib/types";
import { AufgabenClient, type AufgabeView } from "./aufgaben-client";

export const dynamic = "force-dynamic";

export default async function AufgabenPage() {
  const me = await requireLeitung();
  const admin = isAdmin(me);
  const supabase = await createClient();
  const heute = todayISO();

  // Aktive SLs (für Zuweisung/Filter + Gesamtzahl gemeinsamer Aufgaben).
  const { data: slData } = await supabase
    .from("leitungen")
    .select("id, name")
    .eq("rolle", "leitung")
    .eq("aktiv", true)
    .order("name");
  const sls = (slData ?? []) as Pick<Leitung, "id" | "name">[];
  const nameOf = (id: string | null) => sls.find((s) => s.id === id)?.name ?? "—";
  const gemGesamt = sls.length;

  // Aufgaben (RLS: Admin alle; SL eigene einzel + alle gemeinsam).
  const { data: aData } = await supabase
    .from("aufgaben")
    .select("*")
    .order("bis_wann", { ascending: true })
    .order("created_at", { ascending: true });
  const aufgaben = (aData ?? []) as Aufgabe[];

  // Erledigungen (für gemeinsam). RLS: Admin alle; SL eigene.
  const { data: eData } = await supabase
    .from("aufgabe_erledigung")
    .select("aufgabe_id, leitung_id, erledigt");
  const gemDoneCount = new Map<string, number>();
  const myDone = new Set<string>();
  for (const e of (eData ?? []) as { aufgabe_id: string; leitung_id: string; erledigt: boolean }[]) {
    if (!e.erledigt) continue;
    gemDoneCount.set(e.aufgabe_id, (gemDoneCount.get(e.aufgabe_id) ?? 0) + 1);
    if (e.leitung_id === me.id) myDone.add(e.aufgabe_id);
  }

  const views: AufgabeView[] = aufgaben.map((a) => {
    const einzel = a.typ === "einzel";
    const erledigt = einzel ? a.erledigt : myDone.has(a.id);
    return {
      id: a.id,
      was: a.was,
      bis_wann: a.bis_wann,
      typ: a.typ,
      quelle: a.quelle,
      zugewiesen_an: a.zugewiesen_an,
      zugewiesenName: einzel ? nameOf(a.zugewiesen_an) : null,
      kommentar_admin: a.kommentar_admin,
      kommentar_sl: a.kommentar_sl,
      erledigt,
      ueberfaellig: !erledigt && a.bis_wann.slice(0, 10) < heute,
      gemDone: einzel ? null : gemDoneCount.get(a.id) ?? 0,
      gemGesamt: einzel ? null : gemGesamt,
    };
  });

  return (
    <>
      <AppHeader leitung={me} />
      <AufgabenClient admin={admin} sls={sls} aufgaben={views} />
    </>
  );
}
