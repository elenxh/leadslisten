-- =====================================================================
-- Verlauf / Anrufprotokoll: Ergebnis je Anruf + denormalisierte Marker
-- =====================================================================
-- Idempotent, nicht-destruktiv. Im Supabase SQL-Editor ausführbar.
--
-- - anrufe.ergebnis:            erreicht | nicht_erreicht | rueckruf (NULL für
--                              Altzeilen / migrierte Verlaufszeilen).
-- - schulen.letztes_ergebnis:  letztes Anruf-Ergebnis (Marker in der Liste).
-- - schulen.nicht_erreicht_serie: Anzahl aufeinanderfolgender "nicht erreicht"
--                              seit dem letzten erfolgreichen Kontakt.
-- - schulen.akquise_notiz_backup: Sicherheitskopie VOR der Datenmigration 0011.
-- =====================================================================

alter table public.anrufe
  add column if not exists ergebnis text;

alter table public.anrufe drop constraint if exists anrufe_ergebnis_check;
alter table public.anrufe add constraint anrufe_ergebnis_check
  check (ergebnis is null or ergebnis in ('erreicht', 'nicht_erreicht', 'rueckruf'));

-- Historische / importierte Anrufe haben keinen bekannten Urheber -> leitung_id
-- muss NULL erlauben (Alt-Import aus akquise_notiz, siehe 0011).
alter table public.anrufe alter column leitung_id drop not null;

-- Anruf-Ergebnis ist jetzt das Pflichtfeld; ein neuer Status ist OPTIONAL
-- (protokolliereAnruf: "— unverändert —") und Alt-Importe haben keinen Status.
-- Daher status_neu NULL erlauben.
alter table public.anrufe alter column status_neu drop not null;

alter table public.schulen
  add column if not exists letztes_ergebnis text;
alter table public.schulen
  add column if not exists nicht_erreicht_serie integer not null default 0;
alter table public.schulen
  add column if not exists akquise_notiz_backup text;

-- --- Trigger null-sicher machen ---------------------------------------
-- Der bestehende Trigger update_schule_nach_anruf() schrieb bei JEDEM Insert in
-- anrufe schulen.status = NEW.status_neu – auch wenn status_neu NULL ist (Anruf
-- ohne Statuswahl "— unverändert —" ODER Alt-Import). Das verletzt die NOT-NULL-
-- Regel auf schulen.status. Neu: Status nur übernehmen, wenn gesetzt; Erstkontakt
-- nur füllen, wenn leer; Ampel-Referenz nur anheben (rückdatierte/importierte
-- Anrufe senken sie nicht).
create or replace function public.update_schule_nach_anruf()
returns trigger
language plpgsql
as $$
begin
  update public.schulen s
  set
    status           = coalesce(new.status_neu, s.status),
    erstkontakt_am   = coalesce(s.erstkontakt_am, new.datum::date),
    letzter_anruf_am = greatest(s.letzter_anruf_am, new.datum::date)
  where s.id = new.schule_id;
  return new;
end;
$$;

-- Hinweis: Bestehende anrufe haben ergebnis = NULL (Spalte neu), daher ist die
-- Serie zunächst 0 und letztes_ergebnis NULL. Beide Felder werden ab jetzt bei
-- jedem protokollierten Anruf serverseitig neu berechnet (protokolliereAnruf).
