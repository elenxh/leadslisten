-- =====================================================================
-- Phase 2: Erstkontakt-/Wiedervorlage-Datum + einheitliches Status-System
-- =====================================================================
-- Idempotent – kann mehrfach im Supabase SQL-Editor ausgeführt werden.
--
-- - schulen.erstkontakt_am   date  (fix, einmal gesetzt)
-- - schulen.wiedervorlage_am date  (kann später gesetzt/aktualisiert werden)
-- - status auf 7 feste Werte (Text + CHECK), inkl. Migration der Altwerte
--   (gleiche Umstellung für anrufe.status_neu).
-- =====================================================================

-- --- Datumsfelder ------------------------------------------------------
alter table public.schulen add column if not exists erstkontakt_am date;
alter table public.schulen add column if not exists wiedervorlage_am date;

-- Bestehende Wiedervorlage (naechster_anruf) einmalig übernehmen.
update public.schulen
  set wiedervorlage_am = naechster_anruf
  where wiedervorlage_am is null
    and naechster_anruf is not null;

-- --- Status: Enum -> Text (7 Werte) inkl. Mapping ----------------------
-- Nur ausführen, solange die Spalten noch das alte Enum nutzen
-- (macht den Block re-runnable, ohne bestehende Werte zu zerstören).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schulen'
      and column_name = 'status' and udt_name = 'schul_status'
  ) then
    alter table public.schulen alter column status drop default;
    alter table public.schulen
      alter column status type text using (
        case status::text
          when 'neu' then 'Neu'
          when 'versucht' then 'Nicht erreichbar'
          when 'wv' then 'Wiedervorlage'
          when 'gespraech' then 'Wiedervorlage'
          when 'koop' then 'Kooperation'
          when 'kein' then 'Kein Interesse'
          when 'anbieter' then 'Anderer Anbieter'
          else 'Neu'
        end
      );
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'anrufe'
      and column_name = 'status_neu' and udt_name = 'schul_status'
  ) then
    alter table public.anrufe
      alter column status_neu type text using (
        case status_neu::text
          when 'neu' then 'Neu'
          when 'versucht' then 'Nicht erreichbar'
          when 'wv' then 'Wiedervorlage'
          when 'gespraech' then 'Wiedervorlage'
          when 'koop' then 'Kooperation'
          when 'kein' then 'Kein Interesse'
          when 'anbieter' then 'Anderer Anbieter'
          else null
        end
      );
  end if;
end$$;

-- --- Defaults / NOT NULL -----------------------------------------------
update public.schulen set status = 'Neu' where status is null;
alter table public.schulen alter column status set default 'Neu';
alter table public.schulen alter column status set not null;

-- --- CHECK-Constraints (genau die 7 Werte) -----------------------------
alter table public.schulen drop constraint if exists schulen_status_check;
alter table public.schulen add constraint schulen_status_check
  check (status in (
    'Neu', 'Nicht erreichbar', 'Konzept wird weitergeleitet',
    'Anderer Anbieter', 'Kein Interesse', 'Wiedervorlage', 'Kooperation'
  ));

alter table public.anrufe drop constraint if exists anrufe_status_neu_check;
alter table public.anrufe add constraint anrufe_status_neu_check
  check (status_neu is null or status_neu in (
    'Neu', 'Nicht erreichbar', 'Konzept wird weitergeleitet',
    'Anderer Anbieter', 'Kein Interesse', 'Wiedervorlage', 'Kooperation'
  ));

-- =====================================================================
-- Hinweis: Das alte Enum public.schul_status bleibt bestehen (nicht mehr
-- referenziert) – kann später bei Bedarf manuell entfernt werden.
-- status wird über eine Server-Action mit Standort-Prüfung geschrieben
-- (analog zur Schulart-Bearbeitung), daher keine zusätzliche RLS-Policy.
-- =====================================================================
