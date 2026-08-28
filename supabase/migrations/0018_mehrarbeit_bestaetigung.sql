-- =====================================================================
-- Mehrarbeit-Bestätigung: Admin markiert je (SL, Kalenderwoche) mit Mehrarbeit,
-- dass er sie mit den CC-Bestätigungsmails abgeglichen hat. Zeile vorhanden =
-- bestätigt. Idempotent im Supabase SQL-Editor ausführbar.
-- Wiederverwendet: is_admin().
-- =====================================================================

create table if not exists public.mehrarbeit_bestaetigung (
  id             uuid primary key default gen_random_uuid(),
  leitung_id     uuid not null references public.leitungen(id) on delete cascade,
  woche_start    date not null,                    -- Montag der vollen Kalenderwoche
  bestaetigt_von uuid references public.leitungen(id),
  bestaetigt_am  timestamptz not null default now(),
  unique (leitung_id, woche_start)
);

create index if not exists mehrarbeit_best_leitung_idx
  on public.mehrarbeit_bestaetigung(leitung_id, woche_start);

alter table public.mehrarbeit_bestaetigung enable row level security;

-- Lesen: Admin alles; SL die eigenen (Bestätigungsstatus sichtbar).
drop policy if exists mehrarbeit_best_select on public.mehrarbeit_bestaetigung;
create policy mehrarbeit_best_select on public.mehrarbeit_bestaetigung
  for select to authenticated
  using (public.is_admin() or leitung_id = auth.uid());

-- Schreiben (setzen/entfernen): NUR Admin.
drop policy if exists mehrarbeit_best_write on public.mehrarbeit_bestaetigung;
create policy mehrarbeit_best_write on public.mehrarbeit_bestaetigung
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
