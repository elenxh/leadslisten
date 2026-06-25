import * as XLSX from "xlsx";

import { ringForTown } from "@/lib/berlin-ring";

// One school as read from an Excel row (raw, before ring/stadt derivation).
export interface RawSchule {
  name: string;
  bezirk: string | null;
  schulart: string | null;
  homepage: string | null;
  ansprechpartner: string | null;
  rolle_ap: string | null;
  mail: string | null;
  tel: string | null;
  notiz: string | null;
  erstkontakt: string | null; // ISO date (YYYY-MM-DD) aus Spalte J
  status: string | null; // Spalte K
  typ: "schule" | "traeger"; // aus Schulart/Sheet abgeleitet
}

// Erlaubte Status-Werte (Spalte K); alles andere -> null (Default 'Neu').
const STATUS_VALUES = [
  "Neu",
  "Nicht erreichbar",
  "Erstkontakt",
  "Dokumente verschickt",
  "Persönliches Kennenlernen",
  "Kooperationsabschluss",
  "Wiedervorlage Anruf",
  "Kein Interesse",
  "Anderer Anbieter",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Parst eine Datumszelle (Date-Objekt, Excel-Seriennummer oder dd.mm.yyyy)
// zu einem ISO-Datum (YYYY-MM-DD) oder null.
function parseDateCell(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel-Seriennummer (Basis 1899-12-30).
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const dd = m[1];
    const mm = m[2];
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${pad(Number(mm))}-${pad(Number(dd))}`;
  }
  // ISO-ähnlich (YYYY-MM-DD...)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

// Mappt den Status-Text aus Spalte K auf einen der 7 erlaubten Werte.
// Tolerant ggü. Schreibweisen/Varianten; unbekannt -> null (Default 'Neu').
function normalizeStatus(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;

  // exakte (case-insensitive) Treffer zuerst
  const exact = STATUS_VALUES.find((x) => x.toLowerCase() === s);
  if (exact) return exact;

  if (s.includes("nicht erreich")) return "Nicht erreichbar";
  if (s.includes("dokument") || s.includes("konzept") || s.includes("verschickt") || s.includes("weitergeleitet"))
    return "Dokumente verschickt";
  if (s.includes("kennenlernen") || s.includes("persönlich") || s.includes("persoenlich"))
    return "Persönliches Kennenlernen";
  if (s.includes("kooperation") || s === "koop") return "Kooperationsabschluss";
  if (s.includes("anderer anbieter") || s === "anbieter")
    return "Anderer Anbieter";
  if (s.includes("kein interesse") || s === "kein") return "Kein Interesse";
  if (s.includes("wiedervorlage") || s === "wv") return "Wiedervorlage Anruf";
  if (s.includes("erstkontakt")) return "Erstkontakt";
  if (s === "neu") return "Neu";
  return null;
}

export interface ParsedSheet {
  sheet: string;
  schulen: RawSchule[];
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  total: number;
}

// Lilly-Format: Daten ab Zeile 4 (Zeile 1–3 = Header/Logo), Spalten A–K
// (J = Erstkontakt-Datum, K = Status).
const DATA_START_ROW = 3; // 0-based index of Excel row 4

function cell(row: unknown[], idx: number): string | null {
  const v = row[idx];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Standardpositionen (0-basiert): J = Erstkontakt (9), K = Status (10).
const ERSTKONTAKT_FALLBACK = 9;
const STATUS_FALLBACK = 10;

// Erkennt die Spalten für Erstkontakt + Status. Es wird die KOPFZEILE gesucht,
// die "erstkontakt" und/oder "status" enthält, und beide Spalten aus DERSELBEN
// Zeile gelesen – so kann ein zufälliges "Status" in einer Titelzeile nicht die
// falsche Spalte erzwingen. Ohne Treffer: feste Positionen J/K.
function detectColumns(rows: unknown[][]): {
  erstkontaktCol: number;
  statusCol: number;
} {
  let partial: { erstkontaktCol: number; statusCol: number } | null = null;

  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const r = rows[i] ?? [];
    let ek = -1;
    let st = -1;
    for (let c = 0; c < r.length; c++) {
      const v = r[c];
      if (v == null) continue;
      const t = String(v).trim().toLowerCase();
      if (ek < 0 && t.includes("erstkontakt")) ek = c;
      if (st < 0 && /^status\b/.test(t)) st = c;
    }
    if (ek >= 0 && st >= 0) {
      return { erstkontaktCol: ek, statusCol: st }; // beide in einer Zeile -> ideal
    }
    if (!partial && (ek >= 0 || st >= 0)) {
      partial = {
        erstkontaktCol: ek >= 0 ? ek : ERSTKONTAKT_FALLBACK,
        statusCol: st >= 0 ? st : STATUS_FALLBACK,
      };
    }
  }

  return (
    partial ?? {
      erstkontaktCol: ERSTKONTAKT_FALLBACK,
      statusCol: STATUS_FALLBACK,
    }
  );
}

function parseSheet(rows: unknown[][], sheetName: string): RawSchule[] {
  // Spalten J/K können je nach Datei leicht verschoben sein -> per Header
  // erkennen, sonst auf die Standardpositionen (9/10) zurückfallen.
  const { erstkontaktCol, statusCol } = detectColumns(rows);

  const out: RawSchule[] = [];
  for (let i = DATA_START_ROW; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = cell(row, 0); // A
    if (!name) continue; // Leerzeilen / Trenner überspringen
    const schulart = cell(row, 2) ?? sheetName; // C, sonst Sheet-Name
    const istTraeger = /tr[äa]ger/i.test(schulart) || /tr[äa]ger/i.test(sheetName);
    out.push({
      name,
      bezirk: cell(row, 1), // B
      schulart, // C, sonst Sheet-Name
      homepage: cell(row, 3), // D
      ansprechpartner: cell(row, 4), // E
      rolle_ap: cell(row, 5), // F
      mail: cell(row, 6), // G
      tel: cell(row, 7), // H
      notiz: cell(row, 8), // I -> notiz_original
      erstkontakt: parseDateCell(row[erstkontaktCol]), // J -> erstkontakt_am
      status: normalizeStatus(cell(row, statusCol)), // K -> status
      typ: istTraeger ? "traeger" : "schule",
    });
  }
  return out;
}

export function parseWorkbook(wb: XLSX.WorkBook): ParsedWorkbook {
  const sheets: ParsedSheet[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    });
    const schulen = parseSheet(rows, sheetName);
    if (schulen.length) sheets.push({ sheet: sheetName, schulen });
  }
  return { sheets, total: sheets.reduce((n, s) => n + s.schulen.length, 0) };
}

export function parseArrayBuffer(buf: ArrayBuffer): ParsedWorkbook {
  // cellDates: Datumszellen kommen als Date-Objekte (für Spalte J).
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return parseWorkbook(wb);
}

// "Falkensee, Havelland" -> "Falkensee"
export function stadtFromBezirk(bezirk: string | null): string | null {
  if (!bezirk) return null;
  const head = bezirk.split(/[,/]/)[0]?.trim();
  return head && head.length ? head : null;
}

// Derives stadt + ring from the raw row (server-authoritative).
export function deriveOrtUndRing(bezirk: string | null): {
  stadt: string | null;
  ring: number | null;
} {
  const stadt = stadtFromBezirk(bezirk);
  return { stadt, ring: ringForTown(stadt) };
}

export function normalizeKey(name: string, bezirk: string | null): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  const b = (bezirk ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${n}|${b}`;
}
