-- =====================================================================
-- Phase 2: Erstkontakt-/Wiedervorlage-Datum + einheitliches Status-System
-- =====================================================================
-- Idempotent + reihenfolgesicher. Mehrfach im Supabase SQL-Editor ausführbar.
--
-- Reihenfolge bewusst:
--   1) status-Spalte zuerst von Enum -> text (Default droppen, dann TYPE text)
--   2) DANN Altwerte auf die 7 neuen Texte mappen (null -> 'Neu')
--   3) DANN erst CHECK-Constraint mit den 7 erlaubten Werten
--   (gleiche Reihenfolge für anrufe.status_neu)
-- So wird nie ein Wert gesetzt, den der aktuelle Spaltentyp noch nicht kennt.
-- =====================================================================

-- --- Datumsfelder ------------------------------------------------------
alter table public.schulen add column if not exists erstkontakt_am date;
alter table public.schulen add column if not exists wiedervorlage_am date;

-- Bestehende Wiedervorlage (naechster_anruf) einmalig übernehmen.
update public.schulen
  set wiedervorlage_am = naechster_anruf
  where wiedervorlage_am is null
    and naechster_anruf is not null;

-- =====================================================================
-- 1) schulen.status: Enum -> text (nur solange noch nicht text)
-- =====================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schulen'
      and column_name = 'status' and data_type <> 'text'
  ) then
    alter table public.schulen alter column status drop default;
    alter table public.schulen alter column status type text using status::text;
  end if;
end$$;

-- 2) Altwerte -> 7 neue Status (alle neuen Werte auf sich selbst -> re-runnable).
update public.schulen
  set status = case lower(coalesce(status, ''))
    when 'neu' then 'Neu'
    when 'versucht' then 'Nicht erreichbar'
    when 'nicht erreichbar' then 'Nicht erreichbar'
    when 'wv' then 'Wiedervorlage'
    when 'wiedervorlage' then 'Wiedervorlage'
    when 'gespraech' then 'Wiedervorlage'
    when 'gespräch' then 'Wiedervorlage'
    when 'in gespraech' then 'Wiedervorlage'
    when 'in gespräch' then 'Wiedervorlage'
    when 'koop' then 'Kooperation'
    when 'kooperation' then 'Kooperation'
    when 'kein' then 'Kein Interesse'
    when 'kein interesse' then 'Kein Interesse'
    when 'anbieter' then 'Anderer Anbieter'
    when 'anderer anbieter' then 'Anderer Anbieter'
    when 'konzept wird weitergeleitet' then 'Konzept wird weitergeleitet'
    else 'Neu'
  end;

alter table public.schulen alter column status set default 'Neu';
alter table public.schulen alter column status set not null;

-- 3) CHECK-Constraint (genau die 7 Werte).
alter table public.schulen drop constraint if exists schulen_status_check;
alter table public.schulen add constraint schulen_status_check
  check (status in (
    'Neu', 'Nicht erreichbar', 'Konzept wird weitergeleitet',
    'Anderer Anbieter', 'Kein Interesse', 'Wiedervorlage', 'Kooperation'
  ));

-- =====================================================================
-- Gleiche Reihenfolge für anrufe.status_neu (nullable, null bleibt null)
-- =====================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'anrufe'
      and column_name = 'status_neu' and data_type <> 'text'
  ) then
    alter table public.anrufe alter column status_neu drop default;
    alter table public.anrufe
      alter column status_neu type text using status_neu::text;
  end if;
end$$;

update public.anrufe
  set status_neu = case lower(status_neu)
    when 'neu' then 'Neu'
    when 'versucht' then 'Nicht erreichbar'
    when 'nicht erreichbar' then 'Nicht erreichbar'
    when 'wv' then 'Wiedervorlage'
    when 'wiedervorlage' then 'Wiedervorlage'
    when 'gespraech' then 'Wiedervorlage'
    when 'gespräch' then 'Wiedervorlage'
    when 'in gespraech' then 'Wiedervorlage'
    when 'in gespräch' then 'Wiedervorlage'
    when 'koop' then 'Kooperation'
    when 'kooperation' then 'Kooperation'
    when 'kein' then 'Kein Interesse'
    when 'kein interesse' then 'Kein Interesse'
    when 'anbieter' then 'Anderer Anbieter'
    when 'anderer anbieter' then 'Anderer Anbieter'
    when 'konzept wird weitergeleitet' then 'Konzept wird weitergeleitet'
    else 'Neu'
  end
  where status_neu is not null;

alter table public.anrufe drop constraint if exists anrufe_status_neu_check;
alter table public.anrufe add constraint anrufe_status_neu_check
  check (status_neu is null or status_neu in (
    'Neu', 'Nicht erreichbar', 'Konzept wird weitergeleitet',
    'Anderer Anbieter', 'Kein Interesse', 'Wiedervorlage', 'Kooperation'
  ));

-- =====================================================================
-- Hinweis: Der alte Enum-Typ (status_typ) wird nicht mehr referenziert und
-- kann bei Bedarf später manuell entfernt werden:  drop type if exists status_typ;
-- status wird über eine Server-Action mit Standort-Prüfung geschrieben.
-- =====================================================================
