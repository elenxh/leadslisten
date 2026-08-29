-- =====================================================================
-- Ressourcen-Links: dauerhafte, von Elena (Admin) gepflegte Links für die
-- SLs (z. B. Drive-Ordner), angezeigt als Box „Wichtige Links" auf der
-- SL-Meetings-Seite. Prinzip: neue SL-Inhalte kommen hierher, NICHT als
-- neue Header-Reiter. Idempotent. Wiederverwendet: is_admin(),
-- touch_updated_at().
--
-- Rechte:
--  * Lesen: alle authentifizierten Nutzer (SL sieht nur aktive).
--  * Anlegen/Bearbeiten/Löschen: NUR Admin.
-- =====================================================================

create table if not exists public.ressourcen_links (
  id           uuid primary key default gen_random_uuid(),
  titel        text not null,
  url          text not null,
  beschreibung text,
  sortierung   integer not null default 0,
  aktiv        boolean not null default true,
  created_by   uuid references public.leitungen(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ressourcen_links_sort_idx
  on public.ressourcen_links(sortierung);

drop trigger if exists ressourcen_links_touch on public.ressourcen_links;
create trigger ressourcen_links_touch before update on public.ressourcen_links
  for each row execute function public.touch_updated_at();

-- --- RLS ---------------------------------------------------------------
alter table public.ressourcen_links enable row level security;

-- Lesen: Admin alles; SL nur aktive Links.
drop policy if exists ressourcen_links_select on public.ressourcen_links;
create policy ressourcen_links_select on public.ressourcen_links
  for select to authenticated
  using (public.is_admin() or aktiv = true);

-- Schreiben/Löschen: NUR Admin.
drop policy if exists ressourcen_links_write on public.ressourcen_links;
create policy ressourcen_links_write on public.ressourcen_links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
