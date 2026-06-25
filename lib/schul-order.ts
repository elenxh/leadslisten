// Merkt sich die zuletzt im Dashboard angezeigte (gefilterte + sortierte)
// Reihenfolge der Schul-IDs, damit die Detailansicht vor/zurück blättern kann.
// Rein clientseitig (localStorage).

const KEY = "leadslisten:schul-order";

export function writeSchulOrder(ids: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // localStorage nicht verfügbar -> ignorieren
  }
}

export function readSchulOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}
