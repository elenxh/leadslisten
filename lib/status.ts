import type { AnrufTyp } from "@/lib/types";

// =====================================================================
// ZENTRALE Status-Konfiguration – die EINZIGE Stelle für Werte,
// Reihenfolge und Anzeigenamen. Namen später hier ändern, nicht im Code
// verstreut. Der Typ SchulStatus wird direkt aus dieser Liste abgeleitet.
// =====================================================================
export const STATUS_LIST = [
  { value: "Neu", label: "Neu" },
  { value: "Nicht erreichbar", label: "Nicht erreichbar" },
  { value: "Erreicht", label: "Erreicht" },
  { value: "Unterlagen raus", label: "Unterlagen raus" },
  { value: "Im Gespräch", label: "Im Gespräch" },
  { value: "Termin/Kennenlernen", label: "Termin/Kennenlernen" },
  { value: "Abschluss", label: "Abschluss" },
  { value: "Kein Interesse", label: "Kein Interesse" },
  { value: "Anderer Anbieter", label: "Anderer Anbieter" },
] as const;

// Abgeleiteter Typ – ändert sich automatisch mit STATUS_LIST.
export type SchulStatus = (typeof STATUS_LIST)[number]["value"];

// Reine Werteliste (für Server-Allowlist, Excel-Import etc.).
export const STATUS_VALUES: readonly string[] = STATUS_LIST.map((s) => s.value);

// Endzustände (abgeschlossen) – werden grün markiert.
export const END_STATUS: readonly string[] = [
  "Abschluss",
  "Kein Interesse",
  "Anderer Anbieter",
];

// Der "aktive Kooperation"-Endzustand (früher "Kooperationsabschluss").
export const ABSCHLUSS_STATUS = "Abschluss";

export interface StatusMeta {
  value: string;
  label: string;
  // Tailwind classes for the badge (light + dark friendly).
  badge: string;
  // true = Endzustand (abgeschlossen).
  end: boolean;
}

// Neutrales Styling für laufende Pipeline-Status.
const NEUTRAL_BADGE =
  "border-foreground/30 bg-foreground/10 text-foreground dark:border-foreground/35 dark:bg-foreground/15";

// Grünes Styling für Endzustände (abgeschlossen).
const GRUEN_BADGE =
  "border-green-600/30 bg-green-600/10 text-green-700 dark:border-green-500/40 dark:bg-green-500/15 dark:text-green-300";

export function istEndStatus(status: string): boolean {
  return END_STATUS.includes(status);
}

// Tolerant: unbekannte (alte) Werte werden unverändert angezeigt, statt die App
// zum Absturz zu bringen oder auf einen Default zu verfälschen.
export function statusMeta(status: string): StatusMeta {
  const known = STATUS_LIST.find((s) => s.value === status);
  const end = istEndStatus(status);
  return {
    value: status,
    label: known?.label ?? status,
    badge: end ? GRUEN_BADGE : NEUTRAL_BADGE,
    end,
  };
}

export function statusLabel(status: string): string {
  return statusMeta(status).label;
}

export const ANRUF_TYP_LIST: { value: AnrufTyp; label: string }[] = [
  { value: "telefonat", label: "Telefonat" },
  { value: "mail", label: "E-Mail" },
  { value: "vor_ort", label: "Vor-Ort-Termin" },
  { value: "sonstiges", label: "Sonstiges" },
];

export function anrufTypLabel(typ: AnrufTyp): string {
  return ANRUF_TYP_LIST.find((t) => t.value === typ)?.label ?? typ;
}
