import type { AnrufTyp, SchulStatus } from "@/lib/types";

export interface StatusMeta {
  value: SchulStatus;
  label: string;
  // Tailwind classes for the badge (light + dark friendly).
  badge: string;
}

// Einheitliches, NEUTRALES Styling für alle Werte (keine Statusfarben –
// die einzige Farbcodierung in der App ist die Tage-Ampel). Der Status dient
// nur der Information und dem Filtern.
// Kräftig, aber NEUTRAL (keine Ampelfarben) – stärkerer Kontrast + Rahmen,
// damit der Pipeline-Status auf einen Blick erfassbar ist.
const NEUTRAL_BADGE =
  "border-foreground/30 bg-foreground/10 text-foreground dark:border-foreground/35 dark:bg-foreground/15";

export const STATUS_LIST: StatusMeta[] = [
  { value: "Neu", label: "Neu", badge: NEUTRAL_BADGE },
  { value: "Nicht erreichbar", label: "Nicht erreichbar", badge: NEUTRAL_BADGE },
  { value: "Erstkontakt", label: "Erstkontakt", badge: NEUTRAL_BADGE },
  { value: "Dokumente verschickt", label: "Dokumente verschickt", badge: NEUTRAL_BADGE },
  { value: "Persönliches Kennenlernen", label: "Persönliches Kennenlernen", badge: NEUTRAL_BADGE },
  { value: "Kooperationsabschluss", label: "Kooperationsabschluss", badge: NEUTRAL_BADGE },
  { value: "Wiedervorlage Anruf", label: "Wiedervorlage Anruf", badge: NEUTRAL_BADGE },
  { value: "Kein Interesse", label: "Kein Interesse", badge: NEUTRAL_BADGE },
  { value: "Anderer Anbieter", label: "Anderer Anbieter", badge: NEUTRAL_BADGE },
];

const STATUS_MAP = new Map(STATUS_LIST.map((s) => [s.value, s]));

export function statusMeta(status: SchulStatus): StatusMeta {
  return STATUS_MAP.get(status) ?? STATUS_LIST[0];
}

export function statusLabel(status: SchulStatus): string {
  return statusMeta(status).label;
}

export const ANRUF_TYP_LIST: { value: AnrufTyp; label: string }[] = [
  { value: "telefonat", label: "Telefonat" },
  { value: "mail", label: "E-Mail" },
  { value: "vor_ort", label: "Vor Ort" },
  { value: "sonstiges", label: "Sonstiges" },
];

export function anrufTypLabel(typ: AnrufTyp): string {
  return ANRUF_TYP_LIST.find((t) => t.value === typ)?.label ?? typ;
}
