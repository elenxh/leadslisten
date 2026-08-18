-- =====================================================================
-- Rollen-System: RLS auf `schulen` für Standortleitungen (SL = rolle
-- 'leitung') – gescoped über die BESTEHENDE Zuordnung leitung_standort.
-- =====================================================================
-- Idempotent: kann mehrfach im Supabase SQL-Editor ausgeführt werden.
--
-- Wiederverwendet (NICHT neu angelegt):
--   * Tabelle  leitungen         (= "profiles": id, email, name, rolle, aktiv)
--   * Tabelle  leitung_standort  (= n:m SL <-> Standort)
--   * Funktion is_admin()        (rolle = 'admin')
--   * Funktion has_standort()    (= "sl_hat_standort": Admin ODER zugeordnet)
--
-- Neu / geändert in dieser Migration:
--   * has_standort() berücksichtigt jetzt leitungen.aktiv  (deaktivierte
--     SL verlieren jeden Zugriff).
--   * RLS-Policies auf schulen: SELECT/UPDATE/INSERT für Admin ODER die
--     zugeordnete SL; DELETE nur Admin.
-- =====================================================================

-- --- has_standort: jetzt aktiv-bewusst ---------------------------------
-- Admin (is_admin) hat immer Zugriff. Eine SL nur, wenn sie dem Standort
-- zugeordnet UND aktiv ist. p_standort = NULL -> nur Admin (Schulen ohne
-- Standort sind für SL unsichtbar/unveränderbar).
create or replace function public.has_standort(p_standort uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.leitung_standort ls
    join public.leitungen l on l.id = ls.leitung_id
    where ls.leitung_id = auth.uid()
      and ls.standort_id = p_standort
      and l.aktiv
  );
$$;

-- =====================================================================
-- RLS auf schulen
-- =====================================================================
alter table public.schulen enable row level security;

-- Bestehende schulen-Policies (unbekannter Herkunft/Benennung) zuerst
-- vollständig entfernen, damit keine alte, zu weite SELECT-Policy die
-- Standort-Beschränkung unterläuft. Schreibende App-Pfade laufen ohnehin
-- über den Service-Role-Client (umgeht RLS), daher gefahrlos.
-- TIPP: vor dem Ausführen einmal auflisten, WAS existiert:
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname='public' and tablename='schulen';
-- Der folgende Block droppt genau diese Policies und meldet jede per NOTICE.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'schulen'
  loop
    raise notice 'drop policy % on public.schulen', pol.policyname;
    execute format('drop policy if exists %I on public.schulen', pol.policyname);
  end loop;
end$$;

-- SELECT: Admin sieht alles; SL nur Schulen ihrer zugewiesenen Standorte.
create policy schulen_select on public.schulen
  for select
  to authenticated
  using (public.is_admin() or public.has_standort(standort_id));

-- INSERT: Admin überall; SL nur mit standort_id aus ihren Standorten.
create policy schulen_insert on public.schulen
  for insert
  to authenticated
  with check (public.is_admin() or public.has_standort(standort_id));

-- UPDATE: Admin alles; SL nur eigene Standort-Schulen. WITH CHECK verhindert
-- das Verschieben in einen fremden Standort.
create policy schulen_update on public.schulen
  for update
  to authenticated
  using (public.is_admin() or public.has_standort(standort_id))
  with check (public.is_admin() or public.has_standort(standort_id));

-- DELETE: ausschließlich Admin. SL dürfen nie löschen.
create policy schulen_delete on public.schulen
  for delete
  to authenticated
  using (public.is_admin());

-- =====================================================================
-- Hinweis: Ein neuer Login wird beim Anlegen serverseitig direkt mit dem
-- leitungen-Eintrag verknüpft (id = auth.users.id), daher ist kein
-- zusätzlicher Trigger auf auth.users nötig.
-- =====================================================================
