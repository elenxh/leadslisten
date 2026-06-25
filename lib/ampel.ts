// Tage-Ampel: zeigt rein datumsbasiert, wie lange der letzte Kontakt her ist.
// Hat NICHTS mit dem Status zu tun. Referenzdatum = wiedervorlage_am, sonst
// erstkontakt_am.

import { dateOnly } from "@/lib/dates";

export type AmpelStufe = "gruen" | "gelb" | "rot";

export interface AmpelInfo {
  stufe: AmpelStufe | null; // null = kein Datum
  tage: number | null; // heute - Referenzdatum (in Tagen)
}

// Tailwind-Klassen (literal, damit sie vom Scanner erkannt werden).
export const AMPEL_DOT: Record<AmpelStufe, string> = {
  gruen: "bg-green-500",
  gelb: "bg-yellow-400",
  rot: "bg-red-500",
};

function daysSince(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const ref = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - ref.getTime()) / 86_400_000);
}

// Plausibel = ab 01.01.2020 bis einschließlich heute (kein 1900-Müll, keine
// Zukunftsdaten). Schützt vor absurden Werten wie "vor 45967 Tagen".
const MIN_DATUM = "2020-01-01";
function istPlausibel(iso: string): boolean {
  return iso >= MIN_DATUM && daysSince(iso) >= 0;
}

export function ampelInfo(
  erstkontakt: string | null | undefined,
  wiedervorlage: string | null | undefined,
): AmpelInfo {
  const wv = dateOnly(wiedervorlage);
  const ek = dateOnly(erstkontakt);
  // Bevorzugt Wiedervorlage, sonst Erstkontakt – aber nur, wenn plausibel.
  const ref = wv && istPlausibel(wv) ? wv : ek && istPlausibel(ek) ? ek : null;
  if (!ref) return { stufe: null, tage: null };

  const tage = daysSince(ref);
  let stufe: AmpelStufe = "gruen";
  if (tage >= 15) stufe = "rot";
  else if (tage >= 8) stufe = "gelb";
  return { stufe, tage };
}

// "vor X Tagen" / "heute" / "in X Tagen"
export function ampelLabel(tage: number | null): string {
  if (tage == null) return "kein Kontakt";
  if (tage === 0) return "heute";
  if (tage > 0) return `vor ${tage} ${tage === 1 ? "Tag" : "Tagen"}`;
  const t = Math.abs(tage);
  return `in ${t} ${t === 1 ? "Tag" : "Tagen"}`;
}
