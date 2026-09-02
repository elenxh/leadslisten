// Gemeinsame Konstanten/Helfer für die SL-Datei-Ablage (Client + Server).

export const DATEIEN_BUCKET = "sl-dateien";

export const MAX_DATEI_BYTES = 20 * 1024 * 1024; // 20 MB pro Datei

// Großzügige Allowlist: PDF, Office, Bilder, Text.
export const ERLAUBTE_MIME: readonly string[] = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
];

export const ERLAUBTE_ENDUNGEN: readonly string[] = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "png", "jpg", "jpeg", "gif", "webp", "txt", "csv",
];

export function endungVon(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

// Erlaubt, wenn MIME ODER Endung in der Allowlist (tolerant: Browser liefern
// nicht immer einen MIME-Typ).
export function typErlaubt(mime: string | null | undefined, name: string): boolean {
  if (mime && ERLAUBTE_MIME.includes(mime)) return true;
  return ERLAUBTE_ENDUNGEN.includes(endungVon(name));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
