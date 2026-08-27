// Zentrale, pflegbare Definition der Anruf-Ergebnisse. Eine Quelle für Auswahl,
// Marker und Verlauf-Symbole.

export type Ergebnis = "erreicht" | "nicht_erreicht" | "rueckruf";

export interface ErgebnisMeta {
  value: Ergebnis;
  label: string; // vollständiges Label (Dropdown)
  kurz: string; // kurzes Label (Marker/Verlauf)
}

export const ERGEBNIS_LIST: ErgebnisMeta[] = [
  { value: "erreicht", label: "Erreicht", kurz: "erreicht" },
  { value: "nicht_erreicht", label: "Nicht erreicht", kurz: "nicht erreicht" },
  { value: "rueckruf", label: "Rückruf vereinbart", kurz: "Rückruf" },
];

export const ERGEBNIS_VALUES: readonly string[] = ERGEBNIS_LIST.map(
  (e) => e.value,
);

export function ergebnisMeta(v: string | null | undefined): ErgebnisMeta | null {
  if (!v) return null;
  return ERGEBNIS_LIST.find((e) => e.value === v) ?? null;
}

// Nur "nicht erreicht" erhöht die Serie; alles andere (erreicht, Rückruf
// vereinbart) gilt als erfolgreicher Kontakt und setzt sie zurück.
export function istNichtErreicht(v: string | null | undefined): boolean {
  return v === "nicht_erreicht";
}
