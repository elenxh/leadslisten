-- =====================================================================
-- Phase 2: Soziale Träger als eigener Typ
-- =====================================================================
-- Idempotent. Mehrfach im Supabase SQL-Editor ausführbar.
--
-- - schulen.typ ('schule' | 'traeger')
-- - bestehende Einträge mit schulart 'Träger' -> typ 'traeger', Rest 'schule'
-- =====================================================================

alter table public.schulen
  add column if not exists typ text not null default 'schule';

-- Bestehende Träger anhand der Schulart kennzeichnen.
update public.schulen
  set typ = 'traeger'
  where typ <> 'traeger'
    and lower(coalesce(schulart, '')) in ('träger', 'traeger');

alter table public.schulen drop constraint if exists schulen_typ_check;
alter table public.schulen add constraint schulen_typ_check
  check (typ in ('schule', 'traeger'));

create index if not exists schulen_typ_idx on public.schulen(typ);
