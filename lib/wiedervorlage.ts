// Wiedervorlage-Signal – bewusst GETRENNT von der Ampel (beeinflusst sie NICHT).
// "heute" wird in der Geschäfts-Zeitzone bestimmt (siehe lib/dates.ts), damit
// Server- und Client-Render übereinstimmen.

import { dateOnly, endOfWeekISO, formatDate, todayISO } from "@/lib/dates";

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

  let label: string;
  if (tage < 0) label = `überfällig · ${kurz}`;
  else if (tage === 0) label = "heute fällig";
  else if (tage <= 7) label = `in ${tage} ${tage === 1 ? "Tag" : "Tagen"} fällig`;
  else label = `Wiedervorlage: ${kurz}`;

  return {
    datum: d,
    tage,
    heuteFaellig: d <= today, // überfällig zählt als "heute fällig" (To-do)
    dieseWocheFaellig: d <= endOfWeekISO(), // überfällig .. Sonntag
    label,
  };
}
