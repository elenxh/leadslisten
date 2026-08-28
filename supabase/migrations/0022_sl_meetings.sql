-- =====================================================================
-- SL-Meetings: Admin legt ein Meeting EINMAL an; es zählt bei ALLEN
-- ausgewählten Teilnehmerinnen als Meeting-Zeit im Stundennachweis.
-- Idempotent. Wiederverwendet: is_admin(), touch_updated_at().
--
-- Rechte:
--  * Anlegen/Bearbeiten/Löschen: NUR Admin.
--  * Lesen: Admin alles; eine SL nur Meetings, an denen sie teilnimmt.
-- =====================================================================

create table if not exists public.sl_meetings (
  id            uuid primary key default gen_random_uuid(),
  datum         date not null,
  uhrzeit       text,                       -- "HH:MM"
  dauer_minuten integer not null check (dauer_minuten > 0),
  titel         text not null,
  created_by    uuid references public.leitungen(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists sl_meetings_datum_idx on public.sl_meetings(datum);

create table if not exists public.sl_meeting_teilnehmer (
  meeting_id uuid not null references public.sl_meetings(id) on delete cascade,
  leitung_id uuid not null references public.leitungen(id) on delete cascade,
  primary key (meeting_id, leitung_id)
);
create index if not exists sl_meeting_teilnehmer_leitung_idx
  on public.sl_meeting_teilnehmer(leitung_id);

drop trigger if exists sl_meetings_touch on public.sl_meetings;
create trigger sl_meetings_touch before update on public.sl_meetings
  for each row execute function public.touch_updated_at();

-- --- RLS ---------------------------------------------------------------
alter table public.sl_meetings enable row level security;
alter table public.sl_meeting_teilnehmer enable row level security;

-- Meetings lesen: Admin alles; SL nur die eigenen (Teilnahme).
drop policy if exists sl_meetings_select on public.sl_meetings;
create policy sl_meetings_select on public.sl_meetings
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.sl_meeting_teilnehmer t
      where t.meeting_id = sl_meetings.id and t.leitung_id = auth.uid()
    )
  );
-- Meetings schreiben: NUR Admin.
drop policy if exists sl_meetings_write on public.sl_meetings;
create policy sl_meetings_write on public.sl_meetings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Teilnehmer lesen: Admin alles; SL nur die eigene Teilnahme-Zeile.
drop policy if exists sl_meeting_teilnehmer_select on public.sl_meeting_teilnehmer;
create policy sl_meeting_teilnehmer_select on public.sl_meeting_teilnehmer
  for select to authenticated
  using (public.is_admin() or leitung_id = auth.uid());
-- Teilnehmer schreiben: NUR Admin.
drop policy if exists sl_meeting_teilnehmer_write on public.sl_meeting_teilnehmer;
create policy sl_meeting_teilnehmer_write on public.sl_meeting_teilnehmer
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
