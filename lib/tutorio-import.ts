import * as XLSX from "xlsx";

import { deriveOrtUndRing } from "@/lib/excel-import";

// Eine importierte Zeile aus der Tutorio-Vorlage (nach Header-Erkennung).
export interface TutorioRow {
  sheet: string; // Reiter-Name (wie in der Datei)
  excelRow: number; // 1-basierte Excel-Zeilennummer (für Fehlermeldungen)
  typ: "schule" | "traeger";
  name: string;
  schulart: string | null;
  homepage: string | null;
  ansprechpartner: string | null;
  rolle_ap: string | null;
  mail: string | null;
  tel: string | null;
  bezirk: string | null;
  oeffnungszeiten: string | null;
}

export interface TutorioSheetInfo {
  sheet: string;
  typ: "schule" | "traeger";
  count: number;
}

export interface ParsedTutorio {
  rows: TutorioRow[];
  sheets: TutorioSheetInfo[];
  errors: string[]; // Validierungsfehler mit Reiter-/Zeilenbezug
  beispielzeilen: { sheet: string; name: string }[]; // übersprungene Beispielzeilen
}

// Normalisiert Header-/Sheet-Text: klein, ohne Umlaute, Whitespace zusammen.
function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

function cellStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Konvention der bestehenden 119 Berliner Träger (vgl. Migration 0004): sie
// stehen mit typ='traeger' und schulart='Träger' in der Tabelle. Der Träger-
// Reiter hat keine Schulart-Spalte -> wir setzen denselben Wert (schulart ist
// in der DB NOT NULL). istTraegerSchulart('Träger') erkennt das auch im Dashboard.
export const TRAEGER_SCHULART = "Träger";

// Platzhalter aus den Beispielzeilen der Vorlage (Zeile 4). Zeilen mit einem
// dieser Tokens in Name/Ansprechpartner/E-Mail/Homepage werden als Beispiel
// erkannt und beim Import übersprungen (SLs lassen die Beispielzeile oft stehen).
const BEISPIEL_TOKENS = ["muster", "beispiel", "example"];

function istBeispielZeile(felder: (string | null)[]): boolean {
  return felder.some((v) => {
    if (!v) return false;
    const n = norm(v);
    return BEISPIEL_TOKENS.some((t) => n.includes(t));
  });
}

// Reiter-Klassifikation (Vorlage v2): 2 Daten-Reiter „Schulen" und „Soziale
// Träger". Alles andere (Anleitungsblatt, Unbekanntes) wird ignoriert.
function classifySheet(
  sheetName: string,
): { typ: "schule" | "traeger" } | null {
  const n = norm(sheetName);
  if (!n) return null;
  // Anleitungs-/Beispielblatt ignorieren.
  if (/anleitung|beispiel|hinweis|erklar|lies mich|readme|vorlage info/.test(n)) {
    return null;
  }
  if (/trager|sozial/.test(n)) return { typ: "traeger" }; // "Soziale Träger"
  if (/schule/.test(n)) return { typ: "schule" }; // "Schulen"
  return null; // unbekannter Reiter -> ignorieren
}

type FieldKey =
  | "name"
  | "schulart"
  | "homepage"
  | "ansprechpartner"
  | "rolle_ap"
  | "mail"
  | "tel"
  | "bezirk"
  | "oeffnungszeiten";

// Ordnet eine (normalisierte) Header-Zelle einem Feld zu, oder null.
function headerField(h: string): FieldKey | null {
  if (!h) return null;
  if (h.includes("name") && h.includes("ansprech")) return "ansprechpartner";
  if (
    h.includes("name") &&
    (h.includes("schule") || h.includes("einrichtung") || h.includes("trager") || h.includes("sozial"))
  )
    return "name";
  if (h.includes("schulart")) return "schulart";
  if (h.includes("homepage") || h.includes("website") || h.includes("webseite")) return "homepage";
  if (h.includes("rolle")) return "rolle_ap";
  if (h.includes("mail")) return "mail";
  if (h.includes("telefon") || h === "tel" || h.startsWith("tel ") || h.startsWith("tel.")) return "tel";
  if (h.includes("bezirk")) return "bezirk";
  if (h.includes("offnungszeit")) return "oeffnungszeiten";
  return null;
}

// Findet die Kopfzeile (erste Zeile, die die Namensspalte + mind. eine weitere
// bekannte Spalte enthält) und liefert Zeilenindex + Feld->Spaltenindex.
function detectHeader(
  rows: unknown[][],
): { headerIdx: number; cols: Partial<Record<FieldKey, number>> } | null {
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const r = rows[i] ?? [];
    const cols: Partial<Record<FieldKey, number>> = {};
    for (let c = 0; c < r.length; c++) {
      const f = headerField(norm(r[c]));
      if (f && cols[f] === undefined) cols[f] = c;
    }
    const known = Object.keys(cols).length;
    if (cols.name !== undefined && known >= 3) {
      return { headerIdx: i, cols };
    }
  }
  return null;
}

const FELD_LABEL: Record<FieldKey, string> = {
  name: "Name",
  schulart: "Schulart",
  homepage: "Homepage",
  ansprechpartner: "Name Ansprechpartner",
  rolle_ap: "Rolle Ansprechpartner",
  mail: "E-Mail Ansprechpartner",
  tel: "Telefon Ansprechpartner",
  bezirk: "Bezirk",
  oeffnungszeiten: "Öffnungszeiten",
};

// Pflichtspalten je Reiter-Typ (Schulart nur auf Schul-Reitern).
function requiredFields(typ: "schule" | "traeger"): FieldKey[] {
  const base: FieldKey[] = [
    "name",
    "homepage",
    "ansprechpartner",
    "rolle_ap",
    "mail",
    "tel",
  ];
  return typ === "schule" ? ["name", "schulart", ...base.slice(1)] : base;
}

export function parseTutorioWorkbook(buf: ArrayBuffer): ParsedTutorio {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const rows: TutorioRow[] = [];
  const sheets: TutorioSheetInfo[] = [];
  const errors: string[] = [];
  const beispielzeilen: { sheet: string; name: string }[] = [];

  for (const sheetName of wb.SheetNames) {
    const cls = classifySheet(sheetName);
    if (!cls) continue; // Anleitung / unbekannt -> ignorieren
    const typ = cls.typ;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    });

    const header = detectHeader(grid);
    if (!header) {
      errors.push(`Reiter ${sheetName}: Kopfzeile nicht erkannt.`);
      continue;
    }

    // Fehlende Pflichtspalten (Header) melden – dann diesen Reiter nicht zeilen-
    // weise verarbeiten (vermeidet Fehler-Lawine).
    const req = requiredFields(typ);
    const fehlendeSpalten = req.filter((f) => header.cols[f] === undefined);
    if (fehlendeSpalten.length > 0) {
      for (const f of fehlendeSpalten) {
        errors.push(`Reiter ${sheetName}: Spalte „${FELD_LABEL[f]}" fehlt.`);
      }
      continue;
    }

    const col = header.cols;
    const at = (row: unknown[], f: FieldKey): string | null =>
      col[f] === undefined ? null : cellStr(row[col[f] as number]);

    let count = 0;
    for (let i = header.headerIdx + 1; i < grid.length; i++) {
      const row = grid[i] ?? [];
      const vals: Record<FieldKey, string | null> = {
        name: at(row, "name"),
        schulart: at(row, "schulart"),
        homepage: at(row, "homepage"),
        ansprechpartner: at(row, "ansprechpartner"),
        rolle_ap: at(row, "rolle_ap"),
        mail: at(row, "mail"),
        tel: at(row, "tel"),
        bezirk: at(row, "bezirk"),
        oeffnungszeiten: at(row, "oeffnungszeiten"),
      };

      // Komplett leere Zeile (Trenner) überspringen.
      const anyValue = Object.values(vals).some((v) => v != null);
      if (!anyValue) continue;

      // Stehengelassene Beispielzeile der Vorlage überspringen (kein Fehler,
      // keine Daten) – aber MELDEN, damit die Vorschau sie mit Grund anzeigt.
      if (istBeispielZeile([vals.name, vals.ansprechpartner, vals.mail, vals.homepage])) {
        beispielzeilen.push({ sheet: sheetName, name: vals.name ?? "(ohne Namen)" });
        continue;
      }

      const excelRow = i + 1; // 1-basiert

      // Pflichtfelder prüfen – ALLE fehlenden sammeln.
      let rowHasError = false;
      for (const f of req) {
        if (!vals[f]) {
          const label = f === "name" && typ === "schule" ? "Schulname" : FELD_LABEL[f];
          errors.push(`Reiter ${sheetName}, Zeile ${excelRow}: ${label} fehlt.`);
          rowHasError = true;
        }
      }
      if (rowHasError) continue; // fehlerhafte Zeile nicht als Row aufnehmen

      rows.push({
        sheet: sheetName,
        excelRow,
        typ,
        name: vals.name as string,
        schulart: typ === "schule" ? vals.schulart : null,
        homepage: vals.homepage,
        ansprechpartner: vals.ansprechpartner,
        rolle_ap: vals.rolle_ap,
        mail: vals.mail,
        tel: vals.tel,
        bezirk: vals.bezirk,
        oeffnungszeiten: vals.oeffnungszeiten,
      });
      count++;
    }

    sheets.push({ sheet: sheetName, typ, count });
  }

  return { rows, sheets, errors, beispielzeilen };
}

// Duplikat-Schlüssel: Name case-insensitiv, ohne Rand-Leerzeichen, Whitespace
// zusammengefasst. Standort-Scope wird vom Aufrufer gesetzt.
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Baut die akquise_notiz aus optionalen Sachinfos (aktuell: Öffnungszeiten).
export function akquiseNotizAus(row: TutorioRow): string | null {
  if (row.oeffnungszeiten) return `Öffnungszeiten: ${row.oeffnungszeiten}`;
  return null;
}

// Leitet Insert-Stammdaten (stadt/ring aus bezirk) ab.
export function tutorioInsertData(
  row: TutorioRow,
  standortId: string,
): Record<string, unknown> {
  const { stadt, ring } = deriveOrtUndRing(row.bezirk);
  return {
    name: row.name.trim(),
    // schulart ist NOT NULL. Schul-Reiter: geprüfter Wert; Träger-Reiter (ohne
    // Schulart-Spalte): Konventionswert 'Träger' wie die bestehenden Berliner Träger.
    schulart: row.typ === "traeger" ? TRAEGER_SCHULART : row.schulart,
    bezirk: row.bezirk,
    stadt,
    ring,
    homepage: row.homepage,
    ansprechpartner: row.ansprechpartner,
    rolle_ap: row.rolle_ap,
    mail: row.mail,
    tel: row.tel,
    akquise_notiz: akquiseNotizAus(row),
    status: "Neu",
    typ: row.typ,
    standort_id: standortId,
    zustaendig: null,
  };
}
