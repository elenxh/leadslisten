// Wiedervorlage-Signal – bewusst GETRENNT von der Ampel (beeinflusst sie NICHT).
// "heute" wird in der Geschäfts-Zeitzone bestimmt (siehe lib/dates.ts), damit
// Server- und Client-Render übereinstimmen.

import { dateOnly, endOfWeekISO, formatDate, todayISO } from "@/lib/dates";
import { ampelInfo } from "@/lib/ampel";

function ymdMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export interface WiedervorlageInfo {
  datum: string | null; // YYYY-MM-DD oder null
  tage: number | null; // Tage bis zur Wiedervorlage (negativ = überfällig)
  heuteFaellig: boolean; // heute oder überfällig
  dieseWocheFaellig: boolean; // überfällig .. Ende dieser Woche
  label: string; // Anzeige-Text für den Marker
}

export function wiedervorlageInfo(
  wv: string | null | undefined,
): WiedervorlageInfo {
  const d = dateOnly(wv);
  if (!d) {
    return {
      datum: null,
      tage: null,
      heuteFaellig: false,
      dieseWocheFaellig: false,
      label: "",
    };
  }
  const today = todayISO();
  const tage = Math.round((ymdMs(d) - ymdMs(today)) / 86_400_000);
  const kurz = formatDate(d).slice(0, 6); // "25.09."

  // Zukünftige Wiedervorlage = GEPARKT -> neutrales „Wiedervorlage: <Datum>".
  // Nur erreichte/überschrittene WV sind fällig (alarmierend, orange).
  let label: string;
  if (tage < 0) label = `überfällig · ${kurz}`;
  else if (tage === 0) label = "heute fällig";
  else label = `Wiedervorlage: ${kurz}`;

  return {
    datum: d,
    tage,
    heuteFaellig: d <= today, // überfällig zählt als "heute fällig" (To-do)
    dieseWocheFaellig: d <= endOfWeekISO(), // überfällig .. Sonntag
    label,
  };
}

// Felder, die die Fällig-Definition benötigt.
export interface FaelligInput {
  erstkontakt_am: string | null;
  letzter_anruf_am: string | null;
  wiedervorlage_am: string | null;
}

// GEPARKT = es gibt ein ZUKÜNFTIGES Wiedervorlage-Datum. Die Schule hat
// gesagt „melden Sie sich in X Wochen"; bis dahin nicht kontaktieren, auch
// wenn die Ampel rot wird.
export function istGeparkt(s: FaelligInput): boolean {
  const wv = dateOnly(s.wiedervorlage_am);
  return !!wv && wv > todayISO();
}

// ZENTRALE Fällig-Definition (= SL muss die Schule wieder kontaktieren).
// EINZIGE Quelle der Wahrheit für Kacheln, Filter und Listen:
//  * mit zukünftiger Wiedervorlage  -> GEPARKT, nicht fällig (bis zum Datum).
//  * mit erreichter/überschrittener WV -> fällig.
//  * ohne Wiedervorlage -> fällig, wenn Ampel rot (26+ Tage) ODER nie Kontakt.
export function istFaellig(s: FaelligInput): boolean {
  const wv = dateOnly(s.wiedervorlage_am);
  if (wv) return wv <= todayISO();
  const stufe = ampelInfo(s.erstkontakt_am, s.letzter_anruf_am).stufe;
  return stufe === "rot" || stufe === null; // rot oder nie Kontakt (grau)
}
