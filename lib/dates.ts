// Small date helpers working purely on local YYYY-MM-DD strings, so that
// "today" / "overdue" / "this week" behave consistently regardless of time.

export function todayISO(): string {
  const d = new Date();
  return toISO(d);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Returns the ISO date for the upcoming Sunday (end of current week, Mon–Sun).
export function endOfWeekISO(): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() + (6 - dow));
  return toISO(d);
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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
