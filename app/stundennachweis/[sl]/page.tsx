import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import {
  addDaysISO,
  auswerten,
  monatName,
  wochenImZeitraum,
  zeitraumFuer,
  zeitraumFuerMonat,
  zeitraumListe,
  zeitraumMonat,
  MONATE_KURZ,
  type Vertragsmodell,
  type VertragZuweisung,
} from "@/lib/abrechnung";
import { sammleEintraege } from "@/lib/stundennachweis-data";
import type { AdminKommentar } from "@/lib/types";
import { OrdnerNavigation, type MonatsKachel } from "./ordner-navigation";
import { MonatClient } from "./[zeitraum]/monat-client";

export const dynamic = "force-dynamic";

export default async function StundennachweisSLPage({
  params,
  searchParams,
}: {
  params: { sl: string };
  searchParams: { zeitraum?: string };
}) {
  const me = await requireLeitung();
  const admin = isAdmin(me);
  if (!admin && me.id !== params.sl) {
    redirect(`/stundennachweis/${me.id}`);
  }

  const supabase = await createClient();
  const { data: sl } = await supabase
    .from("leitungen")
    .select("id, name")
    .eq("id", params.sl)
    .maybeSingle();
  if (!sl) notFound();

  const heute = todayISO();
  const aktuell = zeitraumFuer(heute);

  // Ausgewählter Zeitraum (aus ?zeitraum), sonst der laufende Abrechnungsmonat.
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.zeitraum ?? "")
    ? (searchParams.zeitraum as string)
    : heute;
  const zeitraum = zeitraumFuer(ref);
  const zeitraumMon = zeitraumMonat(zeitraum);

  // --- Navigation: Jahres-Register + Monatskacheln ---------------------
  const jahre = Array.from(
    new Set([
      ...zeitraumListe(heute, 17).map((z) => zeitraumMonat(z).jahr),
      zeitraumMon.jahr,
    ]),
  ).sort((a, b) => a - b);

  // Alle 12 Monate je Jahr anzeigen — künftige Monate optisch abgesetzt.
  // (SLs planen nach vorn: Wiedervorlagen, Termine.)
  const kacheln: Record<number, MonatsKachel[]> = {};
  for (const jahr of jahre) {
    const arr: MonatsKachel[] = [];
    for (let monat = 1; monat <= 12; monat++) {
      const z = zeitraumFuerMonat(jahr, monat);
      arr.push({
        monat,
        key: z.key,
        label: MONATE_KURZ[monat - 1],
        aktuell: z.key === aktuell.key,
        zukunft: z.key > aktuell.key,
      });
    }
    kacheln[jahr] = arr;
  }

  // --- Monatsinhalt (dieselbe Ladelogik wie zuvor die Monatsseite) -----
  const wochen = wochenImZeitraum(zeitraum);
  const min = (a: string, b: string) => (a < b ? a : b);
  const max = (a: string, b: string) => (a > b ? a : b);
  let rangeStart = zeitraum.startISO;
  let rangeEnd = zeitraum.endISO;
  if (wochen.length) {
    rangeStart = min(rangeStart, wochen[0].montagISO);
    rangeEnd = max(rangeEnd, wochen[wochen.length - 1].sonntagISO);
  }

  const targetId = params.sl;
  const [bundle, { data: vertragData }, { data: modelleData }, { data: tagNotizData }] =
    await Promise.all([
      sammleEintraege(supabase, targetId, rangeStart, rangeEnd),
      supabase.from("leitung_vertrag").select("vertragsmodell_id, gilt_ab").eq("leitung_id", targetId),
      supabase.from("vertragsmodelle").select("*").order("name"),
      supabase.from("tag_notizen").select("datum, notiz").eq("leitung_id", targetId).gte("datum", rangeStart).lte("datum", rangeEnd),
    ]);

  let adminKommentare: AdminKommentar[] = [];
  if (admin) {
    const { data } = await supabase
      .from("admin_kommentare")
      .select("*")
      .eq("leitung_id", targetId);
    adminKommentare = ((data ?? []) as AdminKommentar[]).filter(
      (k) =>
        (k.datum && k.datum >= rangeStart && k.datum <= rangeEnd) ||
        (!k.datum && k.zeitraum_start === zeitraum.startISO),
    );
  }

  const auswertung = auswerten({
    zeitraum,
    modelle: (modelleData ?? []) as Vertragsmodell[],
    zuweisungen: (vertragData ?? []) as VertragZuweisung[],
    ...bundle,
  });

  const tagNotizen = ((tagNotizData ?? []) as { datum: string; notiz: string | null }[]).map((t) => ({
    datum: t.datum.slice(0, 10),
    notiz: t.notiz,
  }));

  // Wiedervorlagen als Kalender-Marker (Protokoll + Schule).
  const wiedervorlagen = new Set<string>();
  {
    const [{ data: protoWv }, { data: lsWv }] = await Promise.all([
      supabase
        .from("gespraechsprotokolle")
        .select("wiedervorlage_am")
        .eq("leitung_id", targetId)
        .gte("wiedervorlage_am", rangeStart)
        .lte("wiedervorlage_am", rangeEnd),
      supabase.from("leitung_standort").select("standort_id").eq("leitung_id", targetId),
    ]);
    for (const r of (protoWv ?? []) as { wiedervorlage_am: string | null }[]) {
      if (r.wiedervorlage_am) wiedervorlagen.add(r.wiedervorlage_am.slice(0, 10));
    }
    const standortIds = ((lsWv ?? []) as { standort_id: string }[]).map((r) => r.standort_id);
    if (standortIds.length) {
      const { data: schulWv } = await supabase
        .from("schulen")
        .select("wiedervorlage_am")
        .in("standort_id", standortIds)
        .gte("wiedervorlage_am", rangeStart)
        .lte("wiedervorlage_am", rangeEnd);
      for (const r of (schulWv ?? []) as { wiedervorlage_am: string | null }[]) {
        if (r.wiedervorlage_am) wiedervorlagen.add(r.wiedervorlage_am.slice(0, 10));
      }
    }
  }

  const prevKey = zeitraumFuer(addDaysISO(zeitraum.startISO, -1)).key;
  const nextKey = zeitraumFuer(addDaysISO(zeitraum.endISO, 1)).key;

  return (
    <>
      <AppHeader leitung={me} />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        {admin && (
          <Link
            href="/stundennachweis"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Alle Standortleitungen
          </Link>
        )}
        <div>
          <h1 className="text-lg font-semibold">{(sl as { name: string }).name}</h1>
          <p className="text-sm text-muted-foreground">
            Monat wählen — der Stundennachweis erscheint direkt darunter.
          </p>
        </div>

        <OrdnerNavigation
          slId={params.sl}
          jahre={jahre}
          defaultJahr={zeitraumMon.jahr}
          activeKey={zeitraum.key}
          kacheln={kacheln}
        />

        <MonatClient
          istAdmin={admin}
          slId={targetId}
          slName={(sl as { name: string }).name}
          monatTitel={monatName(zeitraum)}
          zeitraumStart={zeitraum.startISO}
          zeitraumLabel={zeitraum.label}
          prevKey={prevKey}
          nextKey={nextKey}
          wiedervorlagen={Array.from(wiedervorlagen)}
          auswertung={auswertung}
          tagNotizen={tagNotizen}
          adminKommentare={adminKommentare.map((k) => ({
            datum: k.datum,
            kommentar: k.kommentar,
            farbe: k.farbe,
          }))}
        />
      </main>
    </>
  );
}
