// Small date helpers working purely on YYYY-MM-DD strings, so that
// "today" / "overdue" / "this week" behave consistently regardless of time.
//
// WICHTIG: "heute" wird IMMER in der Geschäfts-Zeitzone (Europe/Berlin)
// bestimmt – deterministisch auf Server (UTC) UND Client (Browser-TZ). Sonst
// weichen SSR- und Client-Render nahe Mitternacht um einen Tag ab und lösen
// Hydration-Mismatches aus (React #418/#423/#425).
const BUSINESS_TZ = "Europe/Berlin";

// "YYYY-MM-DD" für einen Zeitpunkt in der Geschäfts-Zeitzone. Nutzt Intl mit
// fester timeZone -> identisches Ergebnis unabhängig von der Umgebungs-TZ.
export function ymdInBusinessTZ(d: Date = new Date()): string {
  // en-CA liefert das ISO-Format YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayISO(): string {
  return ymdInBusinessTZ();
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Returns the ISO date for the upcoming Sunday (end of current week, Mon–Sun),
// bezogen auf "heute" in der Geschäfts-Zeitzone. Reine UTC-Arithmetik ->
// deterministisch.
export function endOfWeekISO(): string {
  const [y, m, d] = todayISO().split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = (base.getUTCDay() + 6) % 7; // 0 = Monday
  base.setUTCDate(base.getUTCDate() + (6 - dow));
  return base.toISOString().slice(0, 10);
}

// Only the date portion, in case the column stores a timestamp.
export function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

export function isOverdue(naechster_anruf: string | null): boolean {
  const d = dateOnly(naechster_anruf);
  return !!d && d < todayISO();
}

export function isDueToday(naechster_anruf: string | null): boolean {
  return dateOnly(naechster_anruf) === todayISO();
}

export function isDueThisWeek(naechster_anruf: string | null): boolean {
  const d = dateOnly(naechster_anruf);
  return !!d && d >= todayISO() && d <= endOfWeekISO();
}

export function formatDate(value: string | null | undefined): string {
  const d = dateOnly(value);
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return formatDate(value);
  return dt.toLocaleString("de-DE", {
    timeZone: BUSINESS_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
