-- =====================================================================
-- Phase 2 / Schritt 2: Standorte-System
-- =====================================================================
-- Idempotent ausgelegt: kann gefahrlos mehrfach im Supabase SQL-Editor
-- ausgeführt werden.
--
-- Legt an:
--   * enum  standort_status ('aktiv', 'vorgeschlagen')
--   * table standorte
--   * table leitung_standort (n:m Leitung <-> Standort)
--   * spalte schulen.standort_id (n:1, nullable für Bestandsdaten)
--   * helper-funktion public.is_admin()
--   * RLS-Policies für die neuen Tabellen
-- =====================================================================

-- --- Helper: ist der aktuelle User Admin? ------------------------------
-- SECURITY DEFINER, damit die Prüfung die RLS auf leitungen umgeht und
-- keine Rekursion auslöst.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leitungen
    where id = auth.uid()
      and rolle = 'admin'
  );
$$;

-- --- Enum: standort_status --------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'standort_status') then
    create type standort_status as enum ('aktiv', 'vorgeschlagen');
  end if;
end$$;

-- --- Tabelle: standorte -----------------------------------------------
create table if not exists public.standorte (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  status            standort_status not null default 'vorgeschlagen',
  vorgeschlagen_von uuid references public.leitungen(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists standorte_status_idx on public.standorte(status);

-- --- Tabelle: leitung_standort (n:m) ----------------------------------
create table if not exists public.leitung_standort (
  leitung_id  uuid not null references public.leitungen(id) on delete cascade,
  standort_id uuid not null references public.standorte(id) on delete cascade,
  primary key (leitung_id, standort_id)
);

create index if not exists leitung_standort_standort_idx
  on public.leitung_standort(standort_id);

-- --- schulen erweitern -------------------------------------------------
alter table public.schulen
  add column if not exists standort_id uuid
  references public.standorte(id) on delete set null;

create index if not exists schulen_standort_id_idx on public.schulen(standort_id);

-- --- updated_at automatisch pflegen -----------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists standorte_touch_updated_at on public.standorte;
create trigger standorte_touch_updated_at
  before update on public.standorte
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.standorte        enable row level security;
alter table public.leitung_standort enable row level security;

-- --- standorte: SELECT -------------------------------------------------
-- Alle authenticated sehen 'aktiv'; Admin sieht alles; der Vorschlagende
-- sieht zusätzlich seine eigenen (noch nicht freigegebenen) Vorschläge.
drop policy if exists standorte_select on public.standorte;
create policy standorte_select on public.standorte
  for select
  to authenticated
  using (
    status = 'aktiv'
    or vorgeschlagen_von = auth.uid()
    or public.is_admin()
  );

-- --- standorte: INSERT -------------------------------------------------
-- Leitung darf vorschlagen (status = 'vorgeschlagen', auf sich selbst);
-- Admin darf beliebig anlegen.
drop policy if exists standorte_insert on public.standorte;
create policy standorte_insert on public.standorte
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (status = 'vorgeschlagen' and vorgeschlagen_von = auth.uid())
  );

-- --- standorte: UPDATE / DELETE ---------------------------------------
-- Nur Admin (Freigabe = status 'aktiv', Ablehnung = delete).
drop policy if exists standorte_update on public.standorte;
create policy standorte_update on public.standorte
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists standorte_delete on public.standorte;
create policy standorte_delete on public.standorte
  for delete
  to authenticated
  using (public.is_admin());

-- --- leitung_standort: SELECT -----------------------------------------
-- Leitung sieht ihre eigenen Zuordnungen; Admin sieht alle.
drop policy if exists leitung_standort_select on public.leitung_standort;
create policy leitung_standort_select on public.leitung_standort
  for select
  to authenticated
  using (leitung_id = auth.uid() or public.is_admin());

-- --- leitung_standort: schreiben nur Admin ----------------------------
drop policy if exists leitung_standort_insert on public.leitung_standort;
create policy leitung_standort_insert on public.leitung_standort
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists leitung_standort_delete on public.leitung_standort;
create policy leitung_standort_delete on public.leitung_standort
  for delete
  to authenticated
  using (public.is_admin());

-- =====================================================================
-- Fertig. Bestehende Schulen behalten standort_id = NULL und sind unter
-- "Schulen ohne Standort" (Admin) zuordenbar.
-- =====================================================================
