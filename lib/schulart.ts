// Kategorisierung der (frei eingetragenen) Schulart in 6 Gruppen.
// Wird NUR im Code berechnet, nicht in der DB gespeichert.

export type SchulartKategorie =
  | "grundschule"
  | "gemeinschaftsschule"
  | "weiterfuehrende"
  | "gymnasium"
  | "berufsschule"
  | "weitere";

export interface SchulartKategorieMeta {
  value: SchulartKategorie;
  label: string;
}

// Reihenfolge = Anzeige-Reihenfolge der Reiter.
export const SCHULART_KATEGORIEN: SchulartKategorieMeta[] = [
  { value: "grundschule", label: "Grundschule" },
  { value: "gemeinschaftsschule", label: "Gemeinschaftsschule" },
  { value: "weiterfuehrende", label: "Weiterführende" },
  { value: "gymnasium", label: "Gymnasium" },
  { value: "berufsschule", label: "Berufsschule" },
  { value: "weitere", label: "Weitere" },
];

// =====================================================================
// ZENTRALE, pflegbare Zuordnung Schulart -> Kategorie über Schlüsselwörter
// (case-insensitiver Teilstring-Abgleich). Reihenfolge = Priorität: die erste
// Kategorie, deren Keyword passt, gewinnt. Neue Schularten einfach als Keyword
// in die passende Liste eintragen. Alles OHNE Treffer (inkl. leer/unbekannt)
// landet in "Weitere" – so wird garantiert KEINE Schule unsichtbar.
//
// Zuordnung (Berlin):
//   Grundschule           -> "grundschule"
//   Gemeinschaftsschule   -> "gemeinschaft"
//   Weiterführende        -> Integrierte Sekundarschule + Sekundarschule ("sekundar")
//   Gymnasium             -> "gymnasium"
//   Berufsschule          -> Berufsfachschule + alles Berufliche
//   Weitere               -> Oberschule, ZBW + Unbekanntes/Leeres (Fallback)
// =====================================================================
export const SCHULART_KEYWORDS: {
  value: Exclude<SchulartKategorie, "weitere">;
  keywords: string[];
}[] = [
  { value: "grundschule", keywords: ["grundschule"] },
  { value: "gemeinschaftsschule", keywords: ["gemeinschaft"] },
  { value: "gymnasium", keywords: ["gymnasium"] },
  {
    value: "berufsschule",
    keywords: [
      "beruf", // Berufsschule, Berufsfachschule, Berufskolleg, Berufliches …
      "fachschule",
      "osz",
      "oberstufenzentrum",
    ],
  },
  {
    value: "weiterfuehrende",
    keywords: [
      "sekundar", // (Integrierte) Sekundarschule, Sekundarstufe
      "gesamtschule",
      "realschule",
      "hauptschule",
      "mittelschule",
      "stadtteilschule",
    ],
  },
  // Bewusst OHNE Keyword und daher in "Weitere": Oberschule, ZBW – sowie alles
  // sonst Unbekannte/Leere (Fallback in schulartKategorie()).
];

/**
 * Leitet aus der freien `schulart` eine Kategorie ab. Erste Kategorie mit
 * passendem Schlüsselwort gewinnt; ohne Treffer -> "Weitere" (Fallback).
 */
export function schulartKategorie(
  schulart: string | null | undefined,
): SchulartKategorie {
  const s = (schulart ?? "").trim().toLowerCase();
  for (const cat of SCHULART_KEYWORDS) {
    if (cat.keywords.some((k) => s.includes(k))) return cat.value;
  }
  return "weitere";
}

export function schulartKategorieLabel(k: SchulartKategorie): string {
  return SCHULART_KATEGORIEN.find((x) => x.value === k)?.label ?? k;
}

// Erkennt anhand der (freien) Schulart, ob ein Eintrag ein sozialer Träger ist
// und NICHT in die Schulliste gehört. Deckt z. B. ab: "Träger",
// "Freier Träger …", "Soz. Träger", "Öffntl. Organisationen".
export function istTraegerSchulart(
  schulart: string | null | undefined,
): boolean {
  const s = (schulart ?? "").toLowerCase();
  if (!s) return false;
  return /tr[äa]ger|organisation|öffntl|öffentl|offentl/.test(s);
}

// Gängige Berliner Schularten für das Bearbeiten-Dropdown.
export const SCHULART_OPTIONS: string[] = [
  "Grundschule",
  "Integrierte Sekundarschule",
  "Gymnasium",
  "Gemeinschaftsschule",
  "Oberschule",
  "Berufsfachschule",
  "Berufsschule",
  "Förderschule",
  "Sonstige",
];
