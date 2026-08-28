// =====================================================================
// Stundennachweis-Berechnung. Reine Funktionen, in Europe/Berlin gedacht:
// alle Daten sind 'YYYY-MM-DD'-Kalendertage (Berlin). Datumsvergleiche über
// String-Vergleich (lexikografisch = chronologisch), Wochentag/Arithmetik über
// UTC-Mitternacht (zeitzonen-stabil für reine Kalendertage).
//
// Zwei getrennte Aggregationen (bewusst):
//  * Wochen (Wochensoll): volle Kalenderwochen Mo–So, zugeordnet "nach Montag"
//    (Woche gehört zum Zeitraum, in dem ihr Montag liegt).
//  * Zeitraum-Summen (Abrechnung): exakt 26. 00:00 – 25. 23:59:59, d. h.
//    Einträge mit Kalendertag im Fenster [start, ende].
// =====================================================================

export interface Vertragsmodell {
  id: string;
  name: string;
  wochenstunden: number;
  calls_soll_pro_woche: number;
  aktiv: boolean;
}

export interface VertragZuweisung {
  vertragsmodell_id: string;
  gilt_ab: string; // YYYY-MM-DD
}

export interface Zeitraum {
  startISO: string; // 26.
  endISO: string; // 25.
  label: string;
  key: string; // = startISO
}

export interface Woche {
  montagISO: string;
  sonntagISO: string;
  label: string;
  key: string; // = montagISO
}

export interface CallEintrag {
  id: string;
  datumISO: string;
  schuleName: string | null;
  notiz: string | null;
}
export interface TerminEintrag {
  id: string;
  datumISO: string;
  schuleName: string | null;
  notiz: string | null;
}
export interface OrgaEintrag {
  id: string;
  datumISO: string;
  minuten: number;
  kategorie: "meeting_teamleitung" | "orga";
  beschreibung: string | null;
  quelle?: "orga" | "protokoll"; // 'protokoll' = aus 1:1-Gesprächsprotokoll (read-only)
  refId?: string; // Protokoll-ID (für Link), wenn quelle='protokoll'
  dauerFehlt?: boolean; // Protokoll ohne Dauer -> zählt 0, Marker anzeigen
}
export interface StundenEintrag {
  id: string;
  datumISO: string;
  minuten: number;
  notiz: string | null;
}

export const TERMIN_MINUTEN = 60;

// ---- Datums-Helfer (UTC-basiert, für reine Kalendertage) -------------
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function utc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function isoOf(dt: Date): string {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
export function addDaysISO(iso: string, n: number): string {
  const dt = utc(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return isoOf(dt);
}
// 1 = Montag … 7 = Sonntag
export function weekdayISO(iso: string): number {
  const wd = utc(iso).getUTCDay(); // 0=So..6=Sa
  return wd === 0 ? 7 : wd;
}
export function mondayOfISO(iso: string): string {
  return addDaysISO(iso, -(weekdayISO(iso) - 1));
}
function inRange(iso: string, startISO: string, endISO: string): boolean {
  return iso >= startISO && iso <= endISO;
}
function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

// ---- Zeitraum 26.–25. -------------------------------------------------
export function zeitraumFuer(refISO: string): Zeitraum {
  const [y, m, d] = refISO.split("-").map(Number);
  let sy = y;
  let sm = m; // Startmonat (1-basiert)
  if (d < 26) {
    sm -= 1;
    if (sm < 1) {
      sm = 12;
      sy -= 1;
    }
  }
  const startISO = `${sy}-${pad(sm)}-26`;
  let ey = sy;
  let em = sm + 1;
  if (em > 12) {
    em = 1;
    ey += 1;
  }
  const endISO = `${ey}-${pad(em)}-25`;
  return {
    startISO,
    endISO,
    key: startISO,
    label: `${ddmm(startISO)}–${ddmmyyyy(endISO)}`,
  };
}

// Aktueller + `anzahl` ältere Zeiträume (absteigend, neuester zuerst).
export function zeitraumListe(aktuellRefISO: string, anzahl: number): Zeitraum[] {
  const out: Zeitraum[] = [];
  let ref = aktuellRefISO;
  for (let i = 0; i <= anzahl; i++) {
    const z = zeitraumFuer(ref);
    out.push(z);
    // einen Tag vor Start -> voriger Zeitraum
    ref = addDaysISO(z.startISO, -1);
  }
  return out;
}

// Volle Kalenderwochen, deren Montag im Zeitraum [start, ende] liegt.
export function wochenImZeitraum(z: Zeitraum): Woche[] {
  const wochen: Woche[] = [];
  let montag = mondayOfISO(z.startISO);
  if (montag < z.startISO) montag = addDaysISO(montag, 7); // erster Montag ≥ start
  while (montag <= z.endISO) {
    const sonntag = addDaysISO(montag, 6);
    wochen.push({
      montagISO: montag,
      sonntagISO: sonntag,
      key: montag,
      label: `${ddmm(montag)}–${ddmm(sonntag)}`,
    });
    montag = addDaysISO(montag, 7);
  }
  return wochen;
}

// ---- Vertragsmodell-Auflösung ----------------------------------------
export function modellAmTag(
  zuweisungen: VertragZuweisung[],
  modelle: Vertragsmodell[],
  tagISO: string,
): Vertragsmodell | null {
  // jüngste Zuweisung mit gilt_ab <= tag
  let best: VertragZuweisung | null = null;
  for (const z of zuweisungen) {
    if (z.gilt_ab <= tagISO && (!best || z.gilt_ab > best.gilt_ab)) best = z;
  }
  if (!best) return null;
  return modelle.find((m) => m.id === best!.vertragsmodell_id) ?? null;
}

export function minutenProCall(m: Vertragsmodell): number {
  return (m.wochenstunden * 60) / m.calls_soll_pro_woche;
}
export function terminInCalls(m: Vertragsmodell): number {
  return m.calls_soll_pro_woche / m.wochenstunden;
}

// ---- Auswertung -------------------------------------------------------
export interface TagAuswertung {
  datumISO: string;
  wochentag: number; // 1=Mo … 7=So
  calls: CallEintrag[];
  termine: TerminEintrag[];
  orga: OrgaEintrag[];
  stunden: StundenEintrag[];
  imZeitraum: boolean; // Kalendertag innerhalb [start, ende]?
}

export interface WochenAuswertung {
  woche: Woche;
  modell: Vertragsmodell | null;
  tage: TagAuswertung[]; // 7 Tage Mo–So (Kalenderblatt)
  calls: CallEintrag[];
  termine: TerminEintrag[];
  orga: OrgaEintrag[];
  stunden: StundenEintrag[];
  sollCalls: number | null;
  istCallAequivalent: number; // calls + termine*terminInCalls
  erfuellt: boolean | null;
  mehrarbeitCalls: number; // max(0, ist - soll), 0 wenn kein Modell
  berechneteMinuten: number;
  angegebeneMinuten: number;
}

export interface ZeitraumSumme {
  callsCount: number;
  termineCount: number;
  callMinuten: number;
  terminMinuten: number;
  orgaMinuten: number;
  orgaNachKategorie: { kategorie: string; minuten: number }[];
  berechneteMinuten: number;
  angegebeneMinuten: number;
  mehrarbeitCalls: number; // Σ der Wochen-Mehrarbeit (volle Wochen)
}

export interface Auswertung {
  zeitraum: Zeitraum;
  wochen: WochenAuswertung[];
  summe: ZeitraumSumme;
}

export function auswerten(input: {
  zeitraum: Zeitraum;
  modelle: Vertragsmodell[];
  zuweisungen: VertragZuweisung[];
  calls: CallEintrag[];
  termine: TerminEintrag[];
  orga: OrgaEintrag[];
  stunden: StundenEintrag[];
}): Auswertung {
  const { zeitraum, modelle, zuweisungen } = input;
  const wochen = wochenImZeitraum(zeitraum);

  const wochenAus: WochenAuswertung[] = wochen.map((w) => {
    const inW = (iso: string) => inRange(iso, w.montagISO, w.sonntagISO);
    const calls = input.calls.filter((c) => inW(c.datumISO));
    const termine = input.termine.filter((t) => inW(t.datumISO));
    const orga = input.orga.filter((o) => inW(o.datumISO));
    const stunden = input.stunden.filter((s) => inW(s.datumISO));
    const modell = modellAmTag(zuweisungen, modelle, w.montagISO);

    // Kalenderzeilen Mo–So.
    const tage: TagAuswertung[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDaysISO(w.montagISO, i);
      tage.push({
        datumISO: d,
        wochentag: i + 1,
        calls: calls.filter((c) => c.datumISO === d),
        termine: termine.filter((t) => t.datumISO === d),
        orga: orga.filter((o) => o.datumISO === d),
        stunden: stunden.filter((st) => st.datumISO === d),
        imZeitraum: inRange(d, zeitraum.startISO, zeitraum.endISO),
      });
    }

    const sollCalls = modell ? modell.calls_soll_pro_woche : null;
    const istCallAequivalent =
      calls.length + (modell ? termine.length * terminInCalls(modell) : 0);
    const erfuellt = sollCalls == null ? null : istCallAequivalent >= sollCalls;
    const mehrarbeitCalls =
      sollCalls == null ? 0 : Math.max(0, istCallAequivalent - sollCalls);

    const callMin = modell ? calls.length * minutenProCall(modell) : 0;
    const berechneteMinuten =
      callMin +
      termine.length * TERMIN_MINUTEN +
      orga.reduce((n, o) => n + o.minuten, 0);
    const angegebeneMinuten = stunden.reduce((n, s) => n + s.minuten, 0);

    return {
      woche: w,
      modell,
      tage,
      calls,
      termine,
      orga,
      stunden,
      sollCalls,
      istCallAequivalent,
      erfuellt,
      mehrarbeitCalls,
      berechneteMinuten,
      angegebeneMinuten,
    };
  });

  // Zeitraum-Summen: exakt [start, ende] (Abrechnung), Modell je Eintragstag.
  const p = (iso: string) => inRange(iso, zeitraum.startISO, zeitraum.endISO);
  const pCalls = input.calls.filter((c) => p(c.datumISO));
  const pTermine = input.termine.filter((t) => p(t.datumISO));
  const pOrga = input.orga.filter((o) => p(o.datumISO));
  const pStunden = input.stunden.filter((s) => p(s.datumISO));

  const callMinuten = pCalls.reduce((n, c) => {
    const m = modellAmTag(zuweisungen, modelle, c.datumISO);
    return n + (m ? minutenProCall(m) : 0);
  }, 0);
  const terminMinuten = pTermine.length * TERMIN_MINUTEN;
  const orgaMinuten = pOrga.reduce((n, o) => n + o.minuten, 0);
  const orgaMap: Record<string, number> = {};
  for (const o of pOrga) orgaMap[o.kategorie] = (orgaMap[o.kategorie] ?? 0) + o.minuten;

  const summe: ZeitraumSumme = {
    callsCount: pCalls.length,
    termineCount: pTermine.length,
    callMinuten,
    terminMinuten,
    orgaMinuten,
    orgaNachKategorie: Object.entries(orgaMap).map(([kategorie, minuten]) => ({
      kategorie,
      minuten,
    })),
    berechneteMinuten: callMinuten + terminMinuten + orgaMinuten,
    angegebeneMinuten: pStunden.reduce((n, s) => n + s.minuten, 0),
    mehrarbeitCalls: wochenAus.reduce((n, w) => n + w.mehrarbeitCalls, 0),
  };

  return { zeitraum, wochen: wochenAus, summe };
}

// Anzeige-Helfer.
export function stundenAusMinuten(min: number): string {
  const h = min / 60;
  return h.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}
export function rundeCalls(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

export const WOCHENTAG_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
