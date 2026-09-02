-- =====================================================================
-- Aufgaben aus einem Gesprächsprotokoll („Nächste Schritte" als echte, pro SL
-- zuweisbare, abhakbare Aufgaben). Erweitert das BESTEHENDE Protokoll — kein
-- zweiter Protokolltyp. Die inhaltlichen Felder (thema, inhalt, ergebnis,
-- wiedervorlage_am, ampel) existieren bereits (0014); nur diese Kindtabelle
-- ist neu. Idempotent. Wiederverwendet: is_admin().
--
-- WICHTIG: Aufgaben sind KEINE Vergütungszeit — sie erzeugen keine Stunden/
-- Calls und fließen nicht in die Abrechnung (die Meeting-Kopplung läuft weiter
-- allein über gespraechsprotokolle.dauer_minuten).
--
-- Rechte:
--  * Lesen: Admin alles; SL nur die IHR zugewiesenen Aufgaben.
--  * Anlegen/Ändern/Löschen (Zuweisung, Text, Frist): Admin.
--  * Abhaken (erledigt): die zugewiesene SL für ihre eigenen Aufgaben.
-- =====================================================================

create table if not exists public.gespraechsprotokoll_aufgaben (
  id            uuid primary key default gen_random_uuid(),
  protokoll_id  uuid not null references public.gespraechsprotokolle(id) on delete cascade,
  was           text not null,
  zugewiesen_an uuid not null references public.leitungen(id) on delete cascade,
  bis_wann      date not null,
  erledigt      boolean not null default false,
  erledigt_am   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists gp_aufgaben_zugewiesen_offen_idx
  on public.gespraechsprotokoll_aufgaben(zugewiesen_an, erledigt, bis_wann);
create index if not exists gp_aufgaben_protokoll_idx
  on public.gespraechsprotokoll_aufgaben(protokoll_id);

-- --- RLS ---------------------------------------------------------------
alter table public.gespraechsprotokoll_aufgaben enable row level security;

-- Lesen: Admin alles; SL nur die eigenen Aufgaben.
drop policy if exists gp_aufgaben_select on public.gespraechsprotokoll_aufgaben;
create policy gp_aufgaben_select on public.gespraechsprotokoll_aufgaben
  for select to authenticated
  using (public.is_admin() or zugewiesen_an = auth.uid());

-- Anlegen/Löschen + beliebiges Ändern: NUR Admin.
drop policy if exists gp_aufgaben_admin_write on public.gespraechsprotokoll_aufgaben;
create policy gp_aufgaben_admin_write on public.gespraechsprotokoll_aufgaben
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Abhaken: die zugewiesene SL darf ihre eigene Aufgabe aktualisieren
-- (in der App server-seitig auf erledigt/erledigt_am begrenzt).
drop policy if exists gp_aufgaben_sl_update on public.gespraechsprotokoll_aufgaben;
create policy gp_aufgaben_sl_update on public.gespraechsprotokoll_aufgaben
  for update to authenticated
  using (zugewiesen_an = auth.uid())
  with check (zugewiesen_an = auth.uid());
