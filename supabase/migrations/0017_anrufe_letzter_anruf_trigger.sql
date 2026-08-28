-- =====================================================================
-- letzter_anruf_am autoritativ neu berechnen bei jeder anrufe-Änderung
-- (Insert/Update/Delete). Fängt auch Pfade außerhalb der App (Migrationen,
-- Direkt-SQL). Idempotent im Supabase SQL-Editor ausführbar.
--
-- letzter_anruf_am = jüngstes anrufe.datum::date der Schule (NULL, wenn keine
-- Einträge mehr übrig sind). datum wird als Mittag gespeichert -> ::date ist der
-- Berlin-Kalendertag. letztes_ergebnis / nicht_erreicht_serie bleiben von der
-- App (recomputeSchuleMarker) gepflegt.
-- =====================================================================

create or replace function public.anrufe_recalc_letzter_anruf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ziel uuid;
begin
  ziel := coalesce(new.schule_id, old.schule_id);

  update public.schulen s
    set letzter_anruf_am = (
      select max(a.datum::date) from public.anrufe a where a.schule_id = ziel
    )
    where s.id = ziel;

  -- Falls ein Eintrag die Schule wechselt: auch die alte Schule nachziehen.
  if tg_op = 'UPDATE' and new.schule_id is distinct from old.schule_id then
    update public.schulen s
      set letzter_anruf_am = (
        select max(a.datum::date) from public.anrufe a where a.schule_id = old.schule_id
      )
      where s.id = old.schule_id;
  end if;

  return null; -- AFTER-Trigger
end;
$$;

drop trigger if exists anrufe_recalc_letzter_anruf on public.anrufe;
create trigger anrufe_recalc_letzter_anruf
  after insert or update or delete on public.anrufe
  for each row execute function public.anrufe_recalc_letzter_anruf();
