import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  auswerten,
  modellAmTag,
  wochenImZeitraum,
  type CallEintrag,
  type EmailEintrag,
  type OrgaEintrag,
  type StundenEintrag,
  type TerminEintrag,
  type Vertragsmodell,
  type VertragZuweisung,
  type Zeitraum,
} from "@/lib/abrechnung";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Ladebereich eines Zeitraums (Wochen können über die 26.–25.-Grenze ragen).
export function ladeBereich(zeitraum: Zeitraum): { rangeStart: string; rangeEnd: string } {
  const wochen = wochenImZeitraum(zeitraum);
  const min = (a: string, b: string) => (a < b ? a : b);
  const max = (a: string, b: string) => (a > b ? a : b);
  let rangeStart = zeitraum.startISO;
  let rangeEnd = zeitraum.endISO;
  if (wochen.length) {
    rangeStart = min(rangeStart, wochen[0].montagISO);
    rangeEnd = max(rangeEnd, wochen[wochen.length - 1].sonntagISO);
  }
  return { rangeStart, rangeEnd };
}

export interface EintragBundle {
  calls: CallEintrag[];
  termine: TerminEintrag[];
  emails: EmailEintrag[];
  orga: OrgaEintrag[];
  stunden: StundenEintrag[];
}

// Lädt Calls/Termine/Orga/Arbeitsstunden inkl. 1:1-Protokoll-Meetings und
// SL-Meetings (read-only) für EINE Person im Bereich. Zentrale Quelle für
// Monatsseite, Übersicht und Export.
export async function sammleEintraege(
  supabase: ServerClient,
  leitungId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<EintragBundle> {
  const [
    { data: anrufeData },
    { data: orgaData },
    { data: stundenData },
    { data: protokollData },
    slMeetingRes,
  ] = await Promise.all([
    supabase
      .from("anrufe")
      .select("id, datum, typ, ergebnis, text, schule:schule_id(name)")
      .eq("leitung_id", leitungId)
      .gte("datum", `${rangeStart}T00:00:00`)
      .lte("datum", `${rangeEnd}T23:59:59`),
    supabase.from("orga_zeiten").select("*").eq("leitung_id", leitungId).gte("datum", rangeStart).lte("datum", rangeEnd),
    supabase.from("arbeitsstunden").select("*").eq("leitung_id", leitungId).gte("datum", rangeStart).lte("datum", rangeEnd),
    supabase.from("gespraechsprotokolle").select("id, datum, thema, dauer_minuten").eq("leitung_id", leitungId).gte("datum", rangeStart).lte("datum", rangeEnd),
    supabase
      .from("sl_meetings")
      .select("id, datum, uhrzeit, dauer_minuten, titel, sl_meeting_teilnehmer!inner(leitung_id)")
      .eq("sl_meeting_teilnehmer.leitung_id", leitungId)
      .gte("datum", rangeStart)
      .lte("datum", rangeEnd),
  ]);

  type AnrufRow = { id: string; datum: string; typ: string; ergebnis: string | null; text: string | null; schule: { name: string } | null };
  const anrufe = (anrufeData ?? []) as unknown as AnrufRow[];
  const calls: CallEintrag[] = anrufe
    .filter((a) => a.typ === "telefonat" && a.ergebnis === "erreicht")
    .map((a) => ({ id: a.id, datumISO: a.datum.slice(0, 10), schuleName: a.schule?.name ?? null, notiz: a.text }));
  const termine: TerminEintrag[] = anrufe
    .filter((a) => a.typ === "vor_ort")
    .map((a) => ({ id: a.id, datumISO: a.datum.slice(0, 10), schuleName: a.schule?.name ?? null, notiz: a.text }));
  const emails: EmailEintrag[] = anrufe
    .filter((a) => a.typ === "mail")
    .map((a) => ({ id: a.id, datumISO: a.datum.slice(0, 10), schuleName: a.schule?.name ?? null, notiz: a.text }));

  type OrgaRow = { id: string; datum: string; dauer_minuten: number; kategorie: "meeting_teamleitung" | "orga"; beschreibung: string | null };
  const orgaEcht: OrgaEintrag[] = ((orgaData ?? []) as OrgaRow[]).map((o) => ({
    id: o.id, datumISO: o.datum.slice(0, 10), minuten: o.dauer_minuten, kategorie: o.kategorie, beschreibung: o.beschreibung, quelle: "orga",
  }));

  type ProtokollRow = { id: string; datum: string; thema: string | null; dauer_minuten: number | null };
  const protokollMeetings: OrgaEintrag[] = ((protokollData ?? []) as ProtokollRow[]).map((p) => ({
    id: `p:${p.id}`, datumISO: p.datum.slice(0, 10), minuten: p.dauer_minuten ?? 0, kategorie: "meeting_teamleitung",
    beschreibung: p.thema, quelle: "protokoll", refId: p.id, dauerFehlt: p.dauer_minuten == null,
  }));

  type SLMeetingRow = { id: string; datum: string; uhrzeit: string | null; dauer_minuten: number; titel: string };
  const slMeetings: OrgaEintrag[] = ((slMeetingRes.data ?? []) as unknown as SLMeetingRow[]).map((m) => ({
    id: `slm:${m.id}`, datumISO: m.datum.slice(0, 10), minuten: m.dauer_minuten, kategorie: "sl_meeting",
    beschreibung: m.uhrzeit ? `${m.titel} · ${m.uhrzeit}` : m.titel, quelle: "sl_meeting",
  }));

  type StundenRow = { id: string; datum: string; minuten: number; notiz: string | null };
  const stunden: StundenEintrag[] = ((stundenData ?? []) as StundenRow[]).map((s) => ({
    id: s.id, datumISO: s.datum.slice(0, 10), minuten: s.minuten, notiz: s.notiz,
  }));

  return { calls, termine, emails, orga: [...orgaEcht, ...protokollMeetings, ...slMeetings], stunden };
}

const istMeeting = (kat: string) => kat === "meeting_teamleitung" || kat === "sl_meeting";

export interface UebersichtWoche {
  label: string;
  montagISO: string;
  termine: number;
  calls: number;
  emails: number;
  orgaMin: number;
  meetingMin: number;
}
export interface UebersichtZeile {
  slId: string;
  slName: string;
  standorte: string[];
  modellName: string | null;
  callsCount: number;
  termineCount: number;
  emailsCount: number;
  meetingMin: number;
  orgaMin: number;
  berechneteMin: number;
  angegebeneMin: number;
  mehrarbeitCalls: number;
  wochen: UebersichtWoche[];
}

// Baut die beiden Export-Blätter (Übersicht + Wochen) als AOA. Pure -> testbar.
export function baueAbrechnungAOA(
  zeitraumLabel: string,
  zeilen: UebersichtZeile[],
): { uebersicht: (string | number)[][]; wochen: (string | number)[][] } {
  const std = (min: number) => Number((min / 60).toFixed(2));
  const uebersicht: (string | number)[][] = [
    ["Abrechnungszeitraum", zeitraumLabel],
    [],
    [
      "SL", "Standort(e)", "Vertragsmodell",
      "Erfolgreiche Calls", "Vor-Ort-Termine", "E-Mails",
      "Meeting-Minuten (1:1 + SL-Meetings)", "Orga-Minuten",
      "Berechnete Stunden", "Angegebene Stunden", "Mehrarbeit-Calls",
    ],
    ...zeilen.map((z) => [
      z.slName,
      z.standorte.join(", "),
      z.modellName ?? "",
      z.callsCount,
      z.termineCount,
      z.emailsCount,
      z.meetingMin,
      z.orgaMin,
      std(z.berechneteMin),
      std(z.angegebeneMin),
      Number(z.mehrarbeitCalls.toFixed(1)),
    ]),
  ];
  const wochen: (string | number)[][] = [
    ["SL", "Kalenderwoche", "Termine", "Calls", "E-Mails", "Orga-Minuten", "Meeting-Minuten"],
  ];
  for (const z of zeilen) {
    for (const w of z.wochen) {
      wochen.push([z.slName, w.label, w.termine, w.calls, w.emails, w.orgaMin, w.meetingMin]);
    }
  }
  return { uebersicht, wochen };
}

// Baut die Abrechnungs-Übersicht (eine Zeile je SL) für einen Zeitraum.
export async function ladeUebersicht(
  supabase: ServerClient,
  zeitraum: Zeitraum,
): Promise<UebersichtZeile[]> {
  const { rangeStart, rangeEnd } = ladeBereich(zeitraum);

  const [{ data: slData }, { data: lsData }, { data: vertragData }, { data: modelleData }] = await Promise.all([
    supabase.from("leitungen").select("id, name").eq("rolle", "leitung").eq("aktiv", true).order("name"),
    supabase.from("leitung_standort").select("leitung_id, standort:standort_id(name)"),
    supabase.from("leitung_vertrag").select("leitung_id, vertragsmodell_id, gilt_ab"),
    supabase.from("vertragsmodelle").select("*"),
  ]);

  const sls = (slData ?? []) as { id: string; name: string }[];
  const modelle = (modelleData ?? []) as Vertragsmodell[];
  const alleZuweisungen = (vertragData ?? []) as (VertragZuweisung & { leitung_id: string })[];

  const standorteMap = new Map<string, string[]>();
  for (const r of (lsData ?? []) as unknown as { leitung_id: string; standort: { name: string } | null }[]) {
    if (!r.standort) continue;
    const arr = standorteMap.get(r.leitung_id) ?? [];
    arr.push(r.standort.name);
    standorteMap.set(r.leitung_id, arr);
  }

  const zeilen = await Promise.all(
    sls.map(async (sl): Promise<UebersichtZeile> => {
      const bundle = await sammleEintraege(supabase, sl.id, rangeStart, rangeEnd);
      const zuweisungen = alleZuweisungen.filter((z) => z.leitung_id === sl.id);
      const a = auswerten({ zeitraum, modelle, zuweisungen, ...bundle });

      const meetingMin = a.summe.orgaNachKategorie.filter((o) => istMeeting(o.kategorie)).reduce((n, o) => n + o.minuten, 0);
      const orgaMin = a.summe.orgaNachKategorie.filter((o) => o.kategorie === "orga").reduce((n, o) => n + o.minuten, 0);
      const modell = modellAmTag(zuweisungen, modelle, zeitraum.endISO);

      const wochen: UebersichtWoche[] = a.wochen.map((w) => ({
        label: w.woche.label,
        montagISO: w.woche.montagISO,
        termine: w.termine.length,
        calls: w.calls.length,
        emails: w.emails.length,
        orgaMin: w.orga.filter((o) => o.kategorie === "orga").reduce((n, o) => n + o.minuten, 0),
        meetingMin: w.orga.filter((o) => istMeeting(o.kategorie)).reduce((n, o) => n + o.minuten, 0),
      }));

      return {
        slId: sl.id,
        slName: sl.name,
        standorte: standorteMap.get(sl.id) ?? [],
        modellName: modell?.name ?? null,
        callsCount: a.summe.callsCount,
        termineCount: a.summe.termineCount,
        emailsCount: a.summe.emailsCount,
        meetingMin,
        orgaMin,
        berechneteMin: a.summe.berechneteMinuten,
        angegebeneMin: a.summe.angegebeneMinuten,
        mehrarbeitCalls: a.summe.mehrarbeitCalls,
        wochen,
      };
    }),
  );

  return zeilen;
}
