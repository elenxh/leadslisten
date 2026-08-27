-- =====================================================================
-- Spalten-Schutz: nur Admin darf schulen.zustaendig / schulen.standort_id
-- ändern. Standortleitungen (SL) dürfen alle anderen Felder ihrer Standort-
-- Schulen bearbeiten, diese beiden aber NICHT – auch nicht per direktem
-- (RLS-)Request am UI vorbei.
-- =====================================================================
-- Idempotent, nicht-destruktiv. Im Supabase SQL-Editor ausführbar.
--
-- Umsetzung als BEFORE-UPDATE-Trigger (Postgres-RLS ist zeilen-, nicht spalten-
-- basiert): Ist der Aufrufer ein eingeloggter Nicht-Admin, werden zustaendig
-- und standort_id auf ihre alten Werte zurückgesetzt. Admins dürfen ändern;
-- Service-Role (auth.uid() IS NULL – unsere Server-Actions mit eigener Prüfung)
-- läuft ungehindert durch.
-- =====================================================================

create or replace function public.schulen_schuetze_admin_felder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.zustaendig  := old.zustaendig;
    new.standort_id := old.standort_id;
  end if;
  return new;
end;
$$;

drop trigger if exists schulen_schuetze_admin_felder on public.schulen;
create trigger schulen_schuetze_admin_felder
  before update on public.schulen
  for each row
  execute function public.schulen_schuetze_admin_felder();
