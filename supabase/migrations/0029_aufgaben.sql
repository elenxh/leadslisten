-- =====================================================================
-- Eigenständiges Aufgaben-/To-Do-System. Aufgaben sind unabhängig anlegbar;
-- die „Nächsten Schritte" eines Gesprächsprotokolls sind nur EINE Quelle
-- (quelle='protokoll'). Idempotent. Wiederverwendet is_admin(),
-- touch_updated_at().
--
-- WICHTIG: Aufgaben sind KEINE Vergütungszeit — sie erzeugen keine Stunden/
-- Calls und fließen nicht in Stundennachweis/Abrechnung. Reine Nachverfolgung.
--
-- Zuweisungstypen:
--  * typ='einzel'     -> genau eine SL (zugewiesen_an); Erledigung direkt an
--                        der Aufgabe (erledigt/erledigt_am). Deckt „Admin an SL"
--                        und „SL an sich selbst" ab.
--  * typ='gemeinsam'  -> an ALLE SLs; je SL eigene Erledigung in der Tabelle
--                        aufgabe_erledigung (eine Zeile pro SL, lazy angelegt).
--
-- Rechte:
--  * Lesen: Admin alles; SL die ihr zugewiesenen (einzel) + alle gemeinsamen.
--  * Anlegen: Admin für alle; SL nur einzel für sich selbst.
--  * Ändern/Abhaken: Admin alles; SL eigene (einzel: Aufgabe; gemeinsam: eigene
--    Erledigungszeile). SL-Kommentar server-seitig begrenzt.
-- =====================================================================

create table if not exists public.aufgaben (
  id             uuid primary key default gen_random_uuid(),
  was            text not null,
  bis_wann       date not null,
  typ            text not null default 'einzel' check (typ in ('einzel', 'gemeinsam')),
  zugewiesen_an  uuid references public.leitungen(id) on delete cascade, -- NULL bei gemeinsam
  ersteller_id   uuid references public.leitungen(id) on delete set null,
  quelle         text not null default 'manuell' check (quelle in ('manuell', 'protokoll')),
  protokoll_id   uuid references public.gespraechsprotokolle(id) on delete set null,
  kommentar_admin text,
  kommentar_sl    text,
  erledigt       boolean not null default false, -- nur typ='einzel'
  erledigt_am    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint aufgaben_typ_zuweisung_check check (
    (typ = 'einzel' and zugewiesen_an is not null) or
    (typ = 'gemeinsam' and zugewiesen_an is null)
  )
);
create index if not exists aufgaben_zugewiesen_offen_idx
  on public.aufgaben(zugewiesen_an, erledigt, bis_wann);
create index if not exists aufgaben_typ_idx on public.aufgaben(typ);
create index if not exists aufgaben_protokoll_idx on public.aufgaben(protokoll_id);

drop trigger if exists aufgaben_touch on public.aufgaben;
create trigger aufgaben_touch before update on public.aufgaben
  for each row execute function public.touch_updated_at();

-- Erledigung je SL für gemeinsame Aufgaben (lazy: Zeile entsteht beim Abhaken).
create table if not exists public.aufgabe_erledigung (
  aufgabe_id  uuid not null references public.aufgaben(id) on delete cascade,
  leitung_id  uuid not null references public.leitungen(id) on delete cascade,
  erledigt    boolean not null default false,
  erledigt_am timestamptz,
  primary key (aufgabe_id, leitung_id)
);
create index if not exists aufgabe_erledigung_leitung_idx
  on public.aufgabe_erledigung(leitung_id, erledigt);

-- --- RLS: aufgaben ------------------------------------------------------
alter table public.aufgaben enable row level security;

drop policy if exists aufgaben_select on public.aufgaben;
create policy aufgaben_select on public.aufgaben
  for select to authenticated
  using (public.is_admin() or zugewiesen_an = auth.uid() or typ = 'gemeinsam');

-- Anlegen: Admin alles; SL nur einzel für sich selbst (und als Ersteller).
drop policy if exists aufgaben_insert on public.aufgaben;
create policy aufgaben_insert on public.aufgaben
  for insert to authenticated
  with check (
    public.is_admin() or
    (typ = 'einzel' and zugewiesen_an = auth.uid() and ersteller_id = auth.uid())
  );

-- Ändern: Admin alles; SL nur die ihr zugewiesenen (einzel).
drop policy if exists aufgaben_update on public.aufgaben;
create policy aufgaben_update on public.aufgaben
  for update to authenticated
  using (public.is_admin() or zugewiesen_an = auth.uid())
  with check (public.is_admin() or zugewiesen_an = auth.uid());

-- Löschen: Admin alles; SL nur selbst erstellte eigene.
drop policy if exists aufgaben_delete on public.aufgaben;
create policy aufgaben_delete on public.aufgaben
  for delete to authenticated
  using (public.is_admin() or (zugewiesen_an = auth.uid() and ersteller_id = auth.uid()));

-- --- RLS: aufgabe_erledigung -------------------------------------------
alter table public.aufgabe_erledigung enable row level security;

drop policy if exists aufgabe_erledigung_select on public.aufgabe_erledigung;
create policy aufgabe_erledigung_select on public.aufgabe_erledigung
  for select to authenticated
  using (public.is_admin() or leitung_id = auth.uid());

drop policy if exists aufgabe_erledigung_write on public.aufgabe_erledigung;
create policy aufgabe_erledigung_write on public.aufgabe_erledigung
  for all to authenticated
  using (public.is_admin() or leitung_id = auth.uid())
  with check (public.is_admin() or leitung_id = auth.uid());
