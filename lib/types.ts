// Domain types matching the existing Supabase schema.

export type Rolle = "leitung" | "admin";

export type SchulStatus =
  | "Neu"
  | "Nicht erreichbar"
  | "Erstkontakt"
  | "Dokumente verschickt"
  | "Persönliches Kennenlernen"
  | "Kooperationsabschluss"
  | "Wiedervorlage Anruf"
  | "Kein Interesse"
  | "Anderer Anbieter";

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
  status: SchulStatus;
  naechster_anruf: string | null; // ISO date – Altfeld, ersetzt durch wiedervorlage_am
  erstkontakt_am: string | null; // ISO date – fix, einmal gesetzt
  wiedervorlage_am: string | null; // ISO date – kann aktualisiert werden
  akquise_notiz: string | null;
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
  status_neu: SchulStatus | null;
  text: string | null;
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
