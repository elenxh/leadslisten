-- =====================================================================
-- Phase 2: Mehrere Ansprechpartner je Schule (Tabelle kontakte)
-- =====================================================================
-- Idempotent. Im Supabase SQL-Editor ausführbar.
-- =====================================================================

create table if not exists public.kontakte (
  id         uuid primary key default gen_random_uuid(),
  schule_id  uuid not null references public.schulen(id) on delete cascade,
  name       text not null,
  rolle      text,
  telefon    text,
  email      text,
  notiz      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kontakte_schule_idx on public.kontakte(schule_id);

drop trigger if exists kontakte_touch_updated_at on public.kontakte;
create trigger kontakte_touch_updated_at
  before update on public.kontakte
  for each row execute function public.touch_updated_at();

-- --- RLS ---------------------------------------------------------------
alter table public.kontakte enable row level security;

-- Lesen: alle Angemeldeten (Detailseite ist für alle Leitungen sichtbar).
drop policy if exists kontakte_select on public.kontakte;
create policy kontakte_select on public.kontakte
  for select to authenticated
  using (true);

-- Schreiben: Admin oder betreuende Standort-Leitung der zugehörigen Schule.
drop policy if exists kontakte_insert on public.kontakte;
create policy kontakte_insert on public.kontakte
  for insert to authenticated
  with check (
    exists (
      select 1 from public.schulen s
      where s.id = kontakte.schule_id
        and public.has_standort(s.standort_id)
    )
  );

drop policy if exists kontakte_update on public.kontakte;
create policy kontakte_update on public.kontakte
  for update to authenticated
  using (
    exists (
      select 1 from public.schulen s
      where s.id = kontakte.schule_id
        and public.has_standort(s.standort_id)
    )
  )
  with check (
    exists (
      select 1 from public.schulen s
      where s.id = kontakte.schule_id
        and public.has_standort(s.standort_id)
    )
  );

drop policy if exists kontakte_delete on public.kontakte;
create policy kontakte_delete on public.kontakte
  for delete to authenticated
  using (
    exists (
      select 1 from public.schulen s
      where s.id = kontakte.schule_id
        and public.has_standort(s.standort_id)
    )
  );
