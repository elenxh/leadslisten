// Domain types matching the existing Supabase schema.

export type Rolle = "leitung" | "admin";

export type SchulStatus =
  | "neu"
  | "versucht"
  | "wv"
  | "gespraech"
  | "koop"
  | "kein"
  | "anbieter";

export type AnrufTyp = "telefonat" | "mail" | "vor_ort" | "sonstiges";

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
  naechster_anruf: string | null; // ISO date (YYYY-MM-DD)
  akquise_notiz: string | null;
  zustaendig: string | null; // FK -> leitungen.id
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      schul_status: SchulStatus;
      anruf_typ: AnrufTyp;
      rolle: Rolle;
    };
  };
}
