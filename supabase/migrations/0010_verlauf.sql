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

alter table public.schulen
  add column if not exists letztes_ergebnis text;
alter table public.schulen
  add column if not exists nicht_erreicht_serie integer not null default 0;
alter table public.schulen
  add column if not exists akquise_notiz_backup text;

-- Hinweis: Bestehende anrufe haben ergebnis = NULL (Spalte neu), daher ist die
-- Serie zunächst 0 und letztes_ergebnis NULL. Beide Felder werden ab jetzt bei
-- jedem protokollierten Anruf serverseitig neu berechnet (protokolliereAnruf).
