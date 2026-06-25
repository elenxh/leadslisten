-- =====================================================================
-- Phase 2: Farbliche Markierung pro Schule + Farb-Legende je Standort
-- =====================================================================
-- Idempotent – kann mehrfach im Supabase SQL-Editor ausgeführt werden.
--
-- Legt an:
--   * spalte schulen.markierung_farbe  (text, nullable)
--   * tabelle farb_legende             (Bezeichnung der 5 Farben je Standort)
--   * helper public.has_standort(uuid) (Standort-Zugehörigkeit / Admin)
--   * RLS-Policies für farb_legende
-- =====================================================================

-- --- Markierungs-Spalte an der Schule ----------------------------------
alter table public.schulen
  add column if not exists markierung_farbe text;

-- --- Helper: betreut der aktuelle User diesen Standort (oder Admin)? ----
create or replace function public.has_standort(p_standort uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.leitung_standort
    where leitung_id = auth.uid()
      and standort_id = p_standort
  );
$$;

-- --- Tabelle: farb_legende --------------------------------------------
-- Bezeichnung der 5 Farben – gehört zum STANDORT, nicht global.
create table if not exists public.farb_legende (
  id          uuid primary key default gen_random_uuid(),
  standort_id uuid not null references public.standorte(id) on delete cascade,
  farbe       text not null,
  bezeichnung text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (standort_id, farbe)
);

create index if not exists farb_legende_standort_idx
  on public.farb_legende(standort_id);

drop trigger if exists farb_legende_touch_updated_at on public.farb_legende;
create trigger farb_legende_touch_updated_at
  before update on public.farb_legende
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- RLS für farb_legende: Leitung darf die Legende ihrer eigenen Standorte
-- lesen + bearbeiten, Admin alles.
-- =====================================================================
alter table public.farb_legende enable row level security;

drop policy if exists farb_legende_select on public.farb_legende;
create policy farb_legende_select on public.farb_legende
  for select to authenticated
  using (public.has_standort(standort_id));

drop policy if exists farb_legende_insert on public.farb_legende;
create policy farb_legende_insert on public.farb_legende
  for insert to authenticated
  with check (public.has_standort(standort_id));

drop policy if exists farb_legende_update on public.farb_legende;
create policy farb_legende_update on public.farb_legende
  for update to authenticated
  using (public.has_standort(standort_id))
  with check (public.has_standort(standort_id));

drop policy if exists farb_legende_delete on public.farb_legende;
create policy farb_legende_delete on public.farb_legende
  for delete to authenticated
  using (public.has_standort(standort_id));

-- =====================================================================
-- Hinweis: schulen.markierung_farbe wird über eine Server-Action mit
-- Service-Role + serverseitiger Standort-Prüfung geschrieben (analog zur
-- Schulart-Bearbeitung), daher hier keine zusätzliche schulen-Policy.
-- =====================================================================
