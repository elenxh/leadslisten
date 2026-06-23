import type { AnrufTyp, SchulStatus } from "@/lib/types";

export interface StatusMeta {
  value: SchulStatus;
  label: string;
  // Tailwind classes for the badge (light + dark friendly).
  badge: string;
}

export const STATUS_LIST: StatusMeta[] = [
  { value: "neu", label: "Neu", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  { value: "versucht", label: "Versucht", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  { value: "wv", label: "Wiedervorlage", badge: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  { value: "gespraech", label: "In Gespräch", badge: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
  { value: "koop", label: "Kooperation", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  { value: "kein", label: "Kein Interesse", badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" },
  { value: "anbieter", label: "Anderer Anbieter", badge: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
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
