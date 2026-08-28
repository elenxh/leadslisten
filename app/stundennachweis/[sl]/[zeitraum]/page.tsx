import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addDaysISO,
  auswerten,
  monatName,
  wochenImZeitraum,
  zeitraumFuer,
  type Vertragsmodell,
  type VertragZuweisung,
} from "@/lib/abrechnung";
import { sammleEintraege } from "@/lib/stundennachweis-data";
import type { AdminKommentar } from "@/lib/types";
import { MonatClient } from "./monat-client";

export const dynamic = "force-dynamic";

export default async function MonatPage({
  params,
}: {
  params: { sl: string; zeitraum: string };
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

  const ref = /^\d{4}-\d{2}-\d{2}$/.test(params.zeitraum) ? params.zeitraum : undefined;
  const zeitraum = zeitraumFuer(ref ?? new Date().toISOString().slice(0, 10));

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

  // Admin-Kommentare NUR für Admin laden (RLS blockt SL ohnehin).
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

  // Wiedervorlagen als Kalender-Marker (Protokoll- + Schul-Wiedervorlagen).
  // Zusätzliche Daten, nicht Teil des Monatsinhalts — deshalb hier separat.
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
    </>
  );
}
