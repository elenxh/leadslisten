-- =====================================================================
-- Broadcasts: Info-Nachrichten von Elena (Admin) an alle Standortleitungen,
-- angezeigt oben auf dem Dashboard. Mehrere gleichzeitig möglich (neueste
-- zuerst). Idempotent. Wiederverwendet: is_admin().
--
-- Rechte:
--  * Lesen: alle authentifizierten Nutzer.
--  * Anlegen/Löschen: NUR Admin.
-- =====================================================================

create table if not exists public.broadcasts (
  id         uuid primary key default gen_random_uuid(),
  nachricht  text not null,
  created_by uuid references public.leitungen(id),
  created_at timestamptz not null default now()
);
create index if not exists broadcasts_created_at_idx
  on public.broadcasts(created_at desc);

-- --- RLS ---------------------------------------------------------------
alter table public.broadcasts enable row level security;

-- Lesen: alle authentifizierten Nutzer.
drop policy if exists broadcasts_select on public.broadcasts;
create policy broadcasts_select on public.broadcasts
  for select to authenticated using (true);

-- Schreiben/Löschen: NUR Admin.
drop policy if exists broadcasts_write on public.broadcasts;
create policy broadcasts_write on public.broadcasts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
