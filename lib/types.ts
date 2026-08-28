// Domain types matching the existing Supabase schema.

export type Rolle = "leitung" | "admin";

// SchulStatus wird zentral aus STATUS_LIST (lib/status.ts) abgeleitet und hier
// nur re-exportiert, damit die Werte an EINER Stelle gepflegt werden.
import type { SchulStatus } from "@/lib/status";
export type { SchulStatus };

export type SchulTyp = "schule" | "traeger";

export type AnrufTyp = "telefonat" | "mail" | "vor_ort" | "sonstiges";

export type StandortStatus = "aktiv" | "vorgeschlagen";

export interface Leitung {
  id: string;
  name: string;
  email: string;
  kuerzel: string;
  farbe: string | null;
  region: string | null;
  rolle: Rolle;
  aktiv: boolean;
  passwort_geaendert: boolean;
}

export interface Standort {
  id: string;
  name: string;
  status: StandortStatus;
  vorgeschlagen_von: string | null; // FK -> leitungen.id
  created_at: string;
  updated_at: string;
}

export interface LeitungStandort {
  leitung_id: string;
  standort_id: string;
}

export interface Schule {
  id: string;
  name: string;
  schulart: string | null;
  stadt: string | null;
  bezirk: string | null;
  ring: number | null;
  homepage: string | null;
  adresse: string | null;
  ansprechpartner: string | null;
  rolle_ap: string | null;
  mail: string | null;
  tel: string | null;
  notiz_original: string | null;
  notiz_original_backup: string | null; // Sicherheitskopie vor der 0013-Migration
  status: SchulStatus;
  naechster_anruf: string | null; // ISO date – Altfeld, ersetzt durch wiedervorlage_am
  erstkontakt_am: string | null; // ISO date – fix, einmal gesetzt
  wiedervorlage_am: string | null; // ISO date – kann aktualisiert werden
  letzter_anruf_am: string | null; // ISO date – jüngster protokollierter Anruf
  akquise_notiz: string | null;
  akquise_notiz_backup: string | null; // Sicherheitskopie vor der Verlauf-Migration
  letztes_ergebnis: string | null; // letztes Anruf-Ergebnis (Marker)
  nicht_erreicht_serie: number; // aufeinanderfolgende "nicht erreicht"
  zustaendig: string | null; // FK -> leitungen.id
  standort_id: string | null; // FK -> standorte.id
  markierung_farbe: string | null; // persönliche Farbmarkierung
  typ: SchulTyp; // 'schule' | 'traeger'
}

export interface FarbLegende {
  id: string;
  standort_id: string;
  farbe: string;
  bezeichnung: string;
}

export interface Kontakt {
  id: string;
  schule_id: string;
  name: string;
  rolle: string | null;
  telefon: string | null;
  email: string | null;
  notiz: string | null;
}

export interface Anruf {
  id: string;
  schule_id: string;
  leitung_id: string | null;
  datum: string; // ISO timestamp / date
  typ: AnrufTyp;
  ergebnis: string | null; // 'erreicht' | 'nicht_erreicht' | 'rueckruf' | null
  status_neu: SchulStatus | null;
  text: string | null;
}

// 1:1-Gesprächsprotokoll einer Standortleitung (an die Person gekoppelt).
export type ProtokollAmpel = "gruen" | "gelb" | "rot";

// Eine Zeile der "Nächste Schritte"-Tabelle (als jsonb im Protokoll gespeichert).
export interface ProtokollSchritt {
  was: string;
  wer: string;
  bis_wann: string;
}

export interface Gespraechsprotokoll {
  id: string;
  leitung_id: string;
  datum: string; // ISO date (YYYY-MM-DD)
  uhrzeit: string | null; // "HH:MM"
  thema: string | null;
  inhalt: string | null;
  ergebnis: string | null;
  naechste_schritte: string | null; // Freitext
  schritte: ProtokollSchritt[]; // Tabelle Was/Wer/Bis wann
  wiedervorlage_am: string | null; // ISO date
  ampel: ProtokollAmpel | null;
  created_at: string;
  updated_at: string;
}

// --- Stundennachweis / KPI ------------------------------------------
export interface Vertragsmodell {
  id: string;
  name: string;
  wochenstunden: number;
  calls_soll_pro_woche: number;
  aktiv: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeitungVertrag {
  id: string;
  leitung_id: string;
  vertragsmodell_id: string;
  gilt_ab: string; // ISO date
  created_at: string;
}

export type OrgaKategorie = "meeting_teamleitung" | "orga";

export interface OrgaZeit {
  id: string;
  leitung_id: string;
  datum: string; // ISO date
  dauer_minuten: number;
  kategorie: OrgaKategorie;
  beschreibung: string | null;
  created_at: string;
  updated_at: string;
}

export interface Arbeitsstunde {
  id: string;
  leitung_id: string;
  datum: string; // ISO date
  von: string | null; // HH:MM(:SS)
  bis: string | null;
  minuten: number;
  notiz: string | null;
  created_at: string;
  updated_at: string;
}

export interface MehrarbeitBestaetigung {
  id: string;
  leitung_id: string;
  woche_start: string; // ISO date (Montag)
  bestaetigt_von: string | null;
  bestaetigt_am: string;
}

// A school joined with its responsible Leitung (for list/detail views).
export type SchuleMitLeitung = Schule & {
  leitung: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe"> | null;
};

// A Standort joined with the count of its proposing Leitung (for admin views).
export type StandortMitVorschlag = Standort & {
  vorschlagende: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe"> | null;
};

// An Anruf joined with the Leitung who logged it.
export type AnrufMitLeitung = Anruf & {
  leitung: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe"> | null;
};

// Minimal Database shape so the typed Supabase client knows our tables.
export interface Database {
  public: {
    Tables: {
      leitungen: {
        Row: Leitung;
        Insert: Partial<Leitung> & { id: string; email: string; name: string };
        Update: Partial<Leitung>;
      };
      schulen: {
        Row: Schule;
        Insert: Partial<Schule> & { name: string };
        Update: Partial<Schule>;
      };
      anrufe: {
        Row: Anruf;
        Insert: Partial<Anruf> & { schule_id: string; typ: AnrufTyp };
        Update: Partial<Anruf>;
      };
      standorte: {
        Row: Standort;
        Insert: Partial<Standort> & { name: string };
        Update: Partial<Standort>;
      };
      leitung_standort: {
        Row: LeitungStandort;
        Insert: LeitungStandort;
        Update: Partial<LeitungStandort>;
      };
      farb_legende: {
        Row: FarbLegende;
        Insert: Partial<FarbLegende> & {
          standort_id: string;
          farbe: string;
        };
        Update: Partial<FarbLegende>;
      };
      kontakte: {
        Row: Kontakt;
        Insert: Partial<Kontakt> & { schule_id: string; name: string };
        Update: Partial<Kontakt>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      schul_status: SchulStatus;
      anruf_typ: AnrufTyp;
      rolle: Rolle;
      standort_status: StandortStatus;
    };
  };
}
