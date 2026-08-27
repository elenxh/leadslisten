-- =====================================================================
-- Status-Umbenennung auf die neue Auswahlliste
-- =====================================================================
-- Idempotent + reihenfolgesicher (erst CHECK droppen, dann mappen, dann neuen
-- CHECK). Mehrfach im Supabase SQL-Editor ausführbar.
--
-- Neue Werte (Reihenfolge = Pipeline):
--   Neu, Nicht erreichbar, Erreicht, Unterlagen raus, Im Gespräch,
--   Termin/Kennenlernen, Abschluss, Kein Interesse, Anderer Anbieter
--
-- Mapping der Altwerte -> neue Werte:
--   'Kooperationsabschluss'      -> 'Abschluss'            (explizit gewünscht)
--   'Erstkontakt'                -> 'Erreicht'
--   'Dokumente verschickt'       -> 'Unterlagen raus'
--   'Konzept wird weitergeleitet'-> 'Unterlagen raus'      (Alt-Alias)
--   'Persönliches Kennenlernen'  -> 'Termin/Kennenlernen'
--   'Wiedervorlage Anruf'        -> 'Im Gespräch'
--   'Wiedervorlage'              -> 'Im Gespräch'           (Alt-Alias)
--   gleichnamige/neue Werte auf sich selbst; alles andere -> 'Neu'
--
-- HINWEIS: Die App zeigt Altwerte bis zum Lauf dieser Migration unverändert an
-- (kein Crash). Zum SPEICHERN neuer Status muss diese Migration laufen (sonst
-- blockiert der alte CHECK).
-- =====================================================================

-- 1) Alte CHECK-Constraints entfernen, damit das Ummappen nicht blockiert wird.
alter table public.schulen drop constraint if exists schulen_status_check;
alter table public.anrufe   drop constraint if exists anrufe_status_neu_check;

-- 2) Werte mappen (neue Werte auf sich selbst -> re-runnable).
alter table public.schulen alter column status drop default;

update public.schulen
  set status = case lower(coalesce(status, ''))
    when 'neu' then 'Neu'
    when 'nicht erreichbar' then 'Nicht erreichbar'
    when 'erstkontakt' then 'Erreicht'
    when 'erreicht' then 'Erreicht'
    when 'dokumente verschickt' then 'Unterlagen raus'
    when 'konzept wird weitergeleitet' then 'Unterlagen raus'
    when 'unterlagen raus' then 'Unterlagen raus'
    when 'im gespräch' then 'Im Gespräch'
    when 'im gespraech' then 'Im Gespräch'
    when 'wiedervorlage anruf' then 'Im Gespräch'
    when 'wiedervorlage' then 'Im Gespräch'
    when 'persönliches kennenlernen' then 'Termin/Kennenlernen'
    when 'persoenliches kennenlernen' then 'Termin/Kennenlernen'
    when 'termin/kennenlernen' then 'Termin/Kennenlernen'
    when 'kooperationsabschluss' then 'Abschluss'
    when 'kooperation' then 'Abschluss'
    when 'abschluss' then 'Abschluss'
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
    when 'erstkontakt' then 'Erreicht'
    when 'erreicht' then 'Erreicht'
    when 'dokumente verschickt' then 'Unterlagen raus'
    when 'konzept wird weitergeleitet' then 'Unterlagen raus'
    when 'unterlagen raus' then 'Unterlagen raus'
    when 'im gespräch' then 'Im Gespräch'
    when 'im gespraech' then 'Im Gespräch'
    when 'wiedervorlage anruf' then 'Im Gespräch'
    when 'wiedervorlage' then 'Im Gespräch'
    when 'persönliches kennenlernen' then 'Termin/Kennenlernen'
    when 'persoenliches kennenlernen' then 'Termin/Kennenlernen'
    when 'termin/kennenlernen' then 'Termin/Kennenlernen'
    when 'kooperationsabschluss' then 'Abschluss'
    when 'kooperation' then 'Abschluss'
    when 'abschluss' then 'Abschluss'
    when 'kein interesse' then 'Kein Interesse'
    when 'anderer anbieter' then 'Anderer Anbieter'
    else 'Neu'
  end
  where status_neu is not null;

-- 3) Neue CHECK-Constraints (genau die 9 neuen Werte).
alter table public.schulen add constraint schulen_status_check
  check (status in (
    'Neu', 'Nicht erreichbar', 'Erreicht', 'Unterlagen raus',
    'Im Gespräch', 'Termin/Kennenlernen', 'Abschluss',
    'Kein Interesse', 'Anderer Anbieter'
  ));

alter table public.anrufe add constraint anrufe_status_neu_check
  check (status_neu is null or status_neu in (
    'Neu', 'Nicht erreichbar', 'Erreicht', 'Unterlagen raus',
    'Im Gespräch', 'Termin/Kennenlernen', 'Abschluss',
    'Kein Interesse', 'Anderer Anbieter'
  ));
