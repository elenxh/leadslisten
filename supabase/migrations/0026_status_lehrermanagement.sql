-- =====================================================================
-- Neuer Status „Lehrermanagement": Prozessphase NACH „Abschluss"
-- (Stundenplan-Planung mit der Schule). Aktiver Arbeitszustand, KEIN
-- Endzustand. CHECK-Constraints auf schulen.status und anrufe.status_neu
-- um den neuen Wert erweitern. Idempotent.
-- =====================================================================

alter table public.schulen drop constraint if exists schulen_status_check;
alter table public.schulen add constraint schulen_status_check
  check (status in (
    'Neu', 'Nicht erreichbar', 'Erreicht', 'Unterlagen raus',
    'Im Gespräch', 'Termin/Kennenlernen', 'Abschluss', 'Lehrermanagement',
    'Kein Interesse', 'Anderer Anbieter'
  ));

alter table public.anrufe drop constraint if exists anrufe_status_neu_check;
alter table public.anrufe add constraint anrufe_status_neu_check
  check (status_neu is null or status_neu in (
    'Neu', 'Nicht erreichbar', 'Erreicht', 'Unterlagen raus',
    'Im Gespräch', 'Termin/Kennenlernen', 'Abschluss', 'Lehrermanagement',
    'Kein Interesse', 'Anderer Anbieter'
  ));
