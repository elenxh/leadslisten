-- =====================================================================
-- Tages-Notizen der SL im Stundennachweis (eine Notiz je Tag). Idempotent.
-- Wiederverwendet: is_admin(), touch_updated_at().
-- RLS: Admin alles; SL nur die eigenen (lesen + schreiben).
-- =====================================================================

create table if not exists public.tag_notizen (
  id         uuid primary key default gen_random_uuid(),
  leitung_id uuid not null references public.leitungen(id) on delete cascade,
  datum      date not null,
  notiz      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (leitung_id, datum)
);
create index if not exists tag_notizen_leitung_datum_idx
  on public.tag_notizen(leitung_id, datum);

drop trigger if exists tag_notizen_touch on public.tag_notizen;
create trigger tag_notizen_touch before update on public.tag_notizen
  for each row execute function public.touch_updated_at();

alter table public.tag_notizen enable row level security;

drop policy if exists tag_notizen_select on public.tag_notizen;
create policy tag_notizen_select on public.tag_notizen
  for select to authenticated using (public.is_admin() or leitung_id = auth.uid());
drop policy if exists tag_notizen_insert on public.tag_notizen;
create policy tag_notizen_insert on public.tag_notizen
  for insert to authenticated with check (public.is_admin() or leitung_id = auth.uid());
drop policy if exists tag_notizen_update on public.tag_notizen;
create policy tag_notizen_update on public.tag_notizen
  for update to authenticated
  using (public.is_admin() or leitung_id = auth.uid())
  with check (public.is_admin() or leitung_id = auth.uid());
drop policy if exists tag_notizen_delete on public.tag_notizen;
create policy tag_notizen_delete on public.tag_notizen
  for delete to authenticated using (public.is_admin() or leitung_id = auth.uid());
