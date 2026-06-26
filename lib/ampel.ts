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

// Punktfarbe für "kein gültiges Datum" (grau) – identisch zur AmpelBadge.
export const AMPEL_GRAU_DOT = "bg-muted-foreground/30";

// Tage-Schwellen seit letztem gültigen Kontakt. EINZIGE Quelle der Wahrheit –
// sowohl ampelInfo() als auch die Legende leiten sich hieraus ab.
//   0 .. GELB_AB-1  -> grün
//   GELB_AB .. ROT_AB-1 -> gelb
//   >= ROT_AB       -> rot
export const AMPEL_GELB_AB = 13;
export const AMPEL_ROT_AB = 26;

// Legende: aus den Schwellen abgeleitete Bereiche (nicht hardcoden!).
export const AMPEL_LEGENDE: {
  stufe: AmpelStufe | "grau";
  dot: string;
  bereich: string;
  bedeutung: string;
}[] = [
  {
    stufe: "gruen",
    dot: AMPEL_DOT.gruen,
    bereich: `0–${AMPEL_GELB_AB - 1} Tage`,
    bedeutung: "frisch kontaktiert",
  },
  {
    stufe: "gelb",
    dot: AMPEL_DOT.gelb,
    bereich: `${AMPEL_GELB_AB}–${AMPEL_ROT_AB - 1} Tage`,
    bedeutung: "bald fällig",
  },
  {
    stufe: "rot",
    dot: AMPEL_DOT.rot,
    bereich: `${AMPEL_ROT_AB}+ Tage`,
    bedeutung: "offen / To-Do",
  },
  {
    stufe: "grau",
    dot: AMPEL_GRAU_DOT,
    bereich: "kein Kontakt",
    bedeutung: "kein gültiges Datum",
  },
];

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
  letzterAnruf?: string | null | undefined,
): AmpelInfo {
  // Referenz = das NEUESTE (späteste) Datum, das plausibel und <= heute ist,
  // unter: letztem protokollierten Anruf, Erstkontakt und Wiedervorlage.
  // Zukünftige Wiedervorlagen zählen also nicht; Altdaten vor 2020 auch nicht.
  const candidates = [
    dateOnly(erstkontakt),
    dateOnly(wiedervorlage),
    dateOnly(letzterAnruf),
  ].filter((d): d is string => !!d && istPlausibel(d));
  if (candidates.length === 0) return { stufe: null, tage: null };

  // ISO-Datumsstrings sind lexikografisch sortierbar -> Maximum = spätestes.
  const ref = candidates.reduce((a, b) => (a >= b ? a : b));

  const tage = daysSince(ref);
  // Schwellen zentral in AMPEL_GELB_AB / AMPEL_ROT_AB (siehe oben).
  let stufe: AmpelStufe = "gruen";
  if (tage >= AMPEL_ROT_AB) stufe = "rot";
  else if (tage >= AMPEL_GELB_AB) stufe = "gelb";
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
