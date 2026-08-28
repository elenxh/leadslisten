import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  auswerten,
  wochenImZeitraum,
  zeitraumFuer,
  type CallEintrag,
  type OrgaEintrag,
  type StundenEintrag,
  type TerminEintrag,
  type Vertragsmodell,
  type VertragZuweisung,
} from "@/lib/abrechnung";
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
  const [
    { data: anrufeData },
    { data: orgaData },
    { data: stundenData },
    { data: vertragData },
    { data: modelleData },
    { data: mehrarbeitData },
    { data: tagNotizData },
  ] = await Promise.all([
    supabase
      .from("anrufe")
      .select("id, datum, typ, ergebnis, text, schule:schule_id(name)")
      .eq("leitung_id", targetId)
      .gte("datum", `${rangeStart}T00:00:00`)
      .lte("datum", `${rangeEnd}T23:59:59`)
      .order("datum", { ascending: true }),
    supabase.from("orga_zeiten").select("*").eq("leitung_id", targetId).gte("datum", rangeStart).lte("datum", rangeEnd),
    supabase.from("arbeitsstunden").select("*").eq("leitung_id", targetId).gte("datum", rangeStart).lte("datum", rangeEnd),
    supabase.from("leitung_vertrag").select("vertragsmodell_id, gilt_ab").eq("leitung_id", targetId),
    supabase.from("vertragsmodelle").select("*").order("name"),
    supabase.from("mehrarbeit_bestaetigung").select("woche_start").eq("leitung_id", targetId),
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

  type AnrufRow = {
    id: string;
    datum: string;
    typ: string;
    ergebnis: string | null;
    text: string | null;
    schule: { name: string } | null;
  };
  const anrufe = (anrufeData ?? []) as unknown as AnrufRow[];
  const calls: CallEintrag[] = anrufe
    .filter((a) => a.typ === "telefonat" && a.ergebnis === "erreicht")
    .map((a) => ({ id: a.id, datumISO: a.datum.slice(0, 10), schuleName: a.schule?.name ?? null, notiz: a.text }));
  const termine: TerminEintrag[] = anrufe
    .filter((a) => a.typ === "vor_ort")
    .map((a) => ({ id: a.id, datumISO: a.datum.slice(0, 10), schuleName: a.schule?.name ?? null, notiz: a.text }));

  type OrgaRow = { id: string; datum: string; dauer_minuten: number; kategorie: "meeting_teamleitung" | "orga"; beschreibung: string | null };
  const orga: OrgaEintrag[] = ((orgaData ?? []) as OrgaRow[]).map((o) => ({
    id: o.id, datumISO: o.datum.slice(0, 10), minuten: o.dauer_minuten, kategorie: o.kategorie, beschreibung: o.beschreibung,
  }));

  type StundenRow = { id: string; datum: string; minuten: number; notiz: string | null };
  const stunden: StundenEintrag[] = ((stundenData ?? []) as StundenRow[]).map((s) => ({
    id: s.id, datumISO: s.datum.slice(0, 10), minuten: s.minuten, notiz: s.notiz,
  }));

  const auswertung = auswerten({
    zeitraum,
    modelle: (modelleData ?? []) as Vertragsmodell[],
    zuweisungen: (vertragData ?? []) as VertragZuweisung[],
    calls,
    termine,
    orga,
    stunden,
  });

  const bestaetigtWochen = ((mehrarbeitData ?? []) as { woche_start: string }[]).map((r) => r.woche_start);
  const tagNotizen = ((tagNotizData ?? []) as { datum: string; notiz: string | null }[]).map((t) => ({
    datum: t.datum.slice(0, 10),
    notiz: t.notiz,
  }));

  return (
    <>
      <AppHeader leitung={me} />
      <MonatClient
        istAdmin={admin}
        slId={targetId}
        slName={(sl as { name: string }).name}
        zeitraumStart={zeitraum.startISO}
        zeitraumLabel={zeitraum.label}
        auswertung={auswertung}
        bestaetigtWochen={bestaetigtWochen}
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
