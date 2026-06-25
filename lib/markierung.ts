// Feste Farbpalette für die persönliche Schul-Markierung.
// Die Bedeutung legt jede Leitung pro Standort in der Legende fest.

export type MarkierungFarbe = "rot" | "gelb" | "gruen" | "blau" | "lila";

export interface MarkierungMeta {
  value: MarkierungFarbe;
  label: string;
  dot: string; // Hintergrund-Klasse für den Punkt
  bar: string; // Border-Klasse für den linken Balken
}

export const MARKIERUNG_FARBEN: MarkierungMeta[] = [
  { value: "rot", label: "Rot", dot: "bg-red-500", bar: "border-red-500" },
  { value: "gelb", label: "Gelb", dot: "bg-yellow-400", bar: "border-yellow-400" },
  { value: "gruen", label: "Grün", dot: "bg-green-500", bar: "border-green-500" },
  { value: "blau", label: "Blau", dot: "bg-blue-500", bar: "border-blue-500" },
  { value: "lila", label: "Lila", dot: "bg-purple-500", bar: "border-purple-500" },
];

const MAP = new Map(MARKIERUNG_FARBEN.map((m) => [m.value, m]));

export function markierungMeta(
  farbe: string | null | undefined,
): MarkierungMeta | null {
  if (!farbe) return null;
  return MAP.get(farbe as MarkierungFarbe) ?? null;
}
