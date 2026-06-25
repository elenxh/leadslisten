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
const NEUTRAL_BADGE =
  "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground";

export const STATUS_LIST: StatusMeta[] = [
  { value: "Neu", label: "Neu", badge: NEUTRAL_BADGE },
  { value: "Nicht erreichbar", label: "Nicht erreichbar", badge: NEUTRAL_BADGE },
  { value: "Konzept wird weitergeleitet", label: "Konzept wird weitergeleitet", badge: NEUTRAL_BADGE },
  { value: "Anderer Anbieter", label: "Anderer Anbieter", badge: NEUTRAL_BADGE },
  { value: "Kein Interesse", label: "Kein Interesse", badge: NEUTRAL_BADGE },
  { value: "Wiedervorlage", label: "Wiedervorlage", badge: NEUTRAL_BADGE },
  { value: "Kooperation", label: "Kooperation", badge: NEUTRAL_BADGE },
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
