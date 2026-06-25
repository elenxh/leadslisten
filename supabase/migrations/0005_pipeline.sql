-- =====================================================================
-- Phase 2: Status -> Pipeline (9 Stufen)
-- =====================================================================
-- Idempotent + reihenfolgesicher (erst text, dann mappen, dann CHECK).
--
-- Neue Werte (Pipeline-Reihenfolge):
--   Neu, Nicht erreichbar, Erstkontakt, Dokumente verschickt,
--   Persönliches Kennenlernen, Kooperationsabschluss, Wiedervorlage Anruf,
--   Kein Interesse, Anderer Anbieter
--
-- Forward-Mapping der Altwerte:
--   'Konzept wird weitergeleitet' -> 'Dokumente verschickt'
--   'Kooperation'                 -> 'Kooperationsabschluss'
--   'Wiedervorlage'               -> 'Wiedervorlage Anruf'
--   Rest gleichnamig; unbekannt/null -> 'Neu'
-- =====================================================================

-- 1) Spalte sicher auf text (nur falls noch nicht text).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='schulen'
      and column_name='status' and data_type <> 'text'
  ) then
    alter table public.schulen alter column status drop default;
    alter table public.schulen alter column status type text using status::text;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='anrufe'
      and column_name='status_neu' and data_type <> 'text'
  ) then
    alter table public.anrufe alter column status_neu drop default;
    alter table public.anrufe alter column status_neu type text using status_neu::text;
  end if;
end$$;

-- 2) Werte mappen (alle neuen Werte auf sich selbst -> re-runnable).
update public.schulen
  set status = case lower(coalesce(status, ''))
    when 'neu' then 'Neu'
    when 'nicht erreichbar' then 'Nicht erreichbar'
    when 'erstkontakt' then 'Erstkontakt'
    when 'dokumente verschickt' then 'Dokumente verschickt'
    when 'konzept wird weitergeleitet' then 'Dokumente verschickt'
    when 'persönliches kennenlernen' then 'Persönliches Kennenlernen'
    when 'persoenliches kennenlernen' then 'Persönliches Kennenlernen'
    when 'kooperationsabschluss' then 'Kooperationsabschluss'
    when 'kooperation' then 'Kooperationsabschluss'
    when 'wiedervorlage anruf' then 'Wiedervorlage Anruf'
    when 'wiedervorlage' then 'Wiedervorlage Anruf'
    when 'kein interesse' then 'Kein Interesse'
    when 'anderer anbieter' then 'Anderer Anbieter'
    else 'Neu'
  end;

alter table public.schulen alter column status set default 'Neu';
alter table public.schulen alter column status set not null;

update public.anrufe
  set status_neu = case lower(status_neu)
    when 'neu' then 'Neu'
    when 'nicht erreichbar' then 'Nicht erreichbar'
    when 'erstkontakt' then 'Erstkontakt'
    when 'dokumente verschickt' then 'Dokumente verschickt'
    when 'konzept wird weitergeleitet' then 'Dokumente verschickt'
    when 'persönliches kennenlernen' then 'Persönliches Kennenlernen'
    when 'persoenliches kennenlernen' then 'Persönliches Kennenlernen'
    when 'kooperationsabschluss' then 'Kooperationsabschluss'
    when 'kooperation' then 'Kooperationsabschluss'
    when 'wiedervorlage anruf' then 'Wiedervorlage Anruf'
    when 'wiedervorlage' then 'Wiedervorlage Anruf'
    when 'kein interesse' then 'Kein Interesse'
    when 'anderer anbieter' then 'Anderer Anbieter'
    else 'Neu'
  end
  where status_neu is not null;

-- 3) CHECK-Constraints (genau die 9 Werte).
alter table public.schulen drop constraint if exists schulen_status_check;
alter table public.schulen add constraint schulen_status_check
  check (status in (
    'Neu', 'Nicht erreichbar', 'Erstkontakt', 'Dokumente verschickt',
    'Persönliches Kennenlernen', 'Kooperationsabschluss',
    'Wiedervorlage Anruf', 'Kein Interesse', 'Anderer Anbieter'
  ));

alter table public.anrufe drop constraint if exists anrufe_status_neu_check;
alter table public.anrufe add constraint anrufe_status_neu_check
  check (status_neu is null or status_neu in (
    'Neu', 'Nicht erreichbar', 'Erstkontakt', 'Dokumente verschickt',
    'Persönliches Kennenlernen', 'Kooperationsabschluss',
    'Wiedervorlage Anruf', 'Kein Interesse', 'Anderer Anbieter'
  ));
