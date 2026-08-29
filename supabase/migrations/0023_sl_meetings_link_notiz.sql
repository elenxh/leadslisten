-- =====================================================================
-- SL-Meetings: Call-Link + Notizen (von Elena auch nachträglich pflegbar),
-- plus Lese-Tracking pro SL für den Ungelesen-Badge im Header.
-- Idempotent. Wiederverwendet: is_admin().
-- =====================================================================

-- 1) Neue Felder am Meeting.
alter table public.sl_meetings add column if not exists call_link text;
alter table public.sl_meetings add column if not exists notizen text;

-- 2) Lese-Status je SL: wann hat sie den SL-Meetings-Reiter zuletzt geöffnet?
--    Ungelesen = Meeting (Teilnahme) mit created_at/updated_at > gesehen_am.
create table if not exists public.sl_meeting_ansicht (
  leitung_id uuid primary key references public.leitungen(id) on delete cascade,
  gesehen_am timestamptz not null default now()
);

alter table public.sl_meeting_ansicht enable row level security;

-- Lesen: Admin alles; SL nur die eigene Zeile.
drop policy if exists sl_meeting_ansicht_select on public.sl_meeting_ansicht;
create policy sl_meeting_ansicht_select on public.sl_meeting_ansicht
  for select to authenticated
  using (public.is_admin() or leitung_id = auth.uid());

-- Anlegen/Aktualisieren: nur die eigene Zeile (für Upsert beim Öffnen).
drop policy if exists sl_meeting_ansicht_insert on public.sl_meeting_ansicht;
create policy sl_meeting_ansicht_insert on public.sl_meeting_ansicht
  for insert to authenticated
  with check (leitung_id = auth.uid());

drop policy if exists sl_meeting_ansicht_update on public.sl_meeting_ansicht;
create policy sl_meeting_ansicht_update on public.sl_meeting_ansicht
  for update to authenticated
  using (leitung_id = auth.uid())
  with check (leitung_id = auth.uid());
