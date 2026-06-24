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
}

export interface ParsedSheet {
  sheet: string;
  schulen: RawSchule[];
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  total: number;
}

// Lilly-Format: Daten ab Zeile 4 (Zeile 1–3 = Header/Logo), Spalten A–I.
const DATA_START_ROW = 3; // 0-based index of Excel row 4

function cell(row: unknown[], idx: number): string | null {
  const v = row[idx];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseSheet(rows: unknown[][], sheetName: string): RawSchule[] {
  const out: RawSchule[] = [];
  for (let i = DATA_START_ROW; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = cell(row, 0); // A
    if (!name) continue; // Leerzeilen / Trenner überspringen
    out.push({
      name,
      bezirk: cell(row, 1), // B
      schulart: cell(row, 2) ?? sheetName, // C, sonst Sheet-Name
      homepage: cell(row, 3), // D
      ansprechpartner: cell(row, 4), // E
      rolle_ap: cell(row, 5), // F
      mail: cell(row, 6), // G
      tel: cell(row, 7), // H
      notiz: cell(row, 8), // I -> notiz_original
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
  const wb = XLSX.read(buf, { type: "array" });
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
