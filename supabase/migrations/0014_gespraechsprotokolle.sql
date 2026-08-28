-- =====================================================================
-- 1:1-Gesprächsprotokolle für Standortleitungen (ersetzt ein separates
-- Word-Dokument). Gekoppelt an die PERSON (leitung_id), NICHT an den
-- Standort – die SL sieht ihre Protokolle unabhängig vom Standort.
-- =====================================================================
-- Idempotent, nicht-destruktiv. Im Supabase SQL-Editor ausführbar.
--
-- Rechtemodell "alles gemeinsam" (per RLS):
--   * Admin  -> sieht + bearbeitet ALLE Protokolle.
--   * SL     -> sieht + bearbeitet NUR die eigenen (leitung_id = auth.uid()).
-- Wiederverwendet: is_admin(), touch_updated_at().
--
-- "Nächste Schritte"-Tabelle: als jsonb-Array [{was,wer,bis_wann}, …] – wird
-- immer zusammen mit dem Protokoll gespeichert/angezeigt, daher keine
-- Kindtabelle.
-- =====================================================================

create table if not exists public.gespraechsprotokolle (
  id                uuid primary key default gen_random_uuid(),
  leitung_id        uuid not null references public.leitungen(id) on delete cascade,
  datum             date not null default current_date,
  uhrzeit           text,                       -- "HH:MM"
  thema             text,                       -- Thema/Anlass
  inhalt            text,                       -- Gesprächsinhalt/Notizen
  ergebnis          text,                       -- Ergebnis/Vereinbarungen
  naechste_schritte text,                       -- Freitext "Nächste Schritte"
  schritte          jsonb not null default '[]'::jsonb, -- [{was,wer,bis_wann}, …]
  wiedervorlage_am  date,
  ampel             text check (ampel is null or ampel in ('gruen', 'gelb', 'rot')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists gespraechsprotokolle_leitung_datum_idx
  on public.gespraechsprotokolle(leitung_id, datum desc, created_at desc);

drop trigger if exists gespraechsprotokolle_touch_updated_at on public.gespraechsprotokolle;
create trigger gespraechsprotokolle_touch_updated_at
  before update on public.gespraechsprotokolle
  for each row execute function public.touch_updated_at();

-- --- RLS ---------------------------------------------------------------
alter table public.gespraechsprotokolle enable row level security;

-- Lesen: Admin alles; SL nur die eigenen.
drop policy if exists gespraechsprotokolle_select on public.gespraechsprotokolle;
create policy gespraechsprotokolle_select on public.gespraechsprotokolle
  for select to authenticated
  using (public.is_admin() or leitung_id = auth.uid());

-- Anlegen: Admin für jede Person; SL nur für sich selbst.
drop policy if exists gespraechsprotokolle_insert on public.gespraechsprotokolle;
create policy gespraechsprotokolle_insert on public.gespraechsprotokolle
  for insert to authenticated
  with check (public.is_admin() or leitung_id = auth.uid());

-- Ändern: Admin alles; SL nur eigene. WITH CHECK verhindert Umhängen an eine
-- fremde Person.
drop policy if exists gespraechsprotokolle_update on public.gespraechsprotokolle;
create policy gespraechsprotokolle_update on public.gespraechsprotokolle
  for update to authenticated
  using (public.is_admin() or leitung_id = auth.uid())
  with check (public.is_admin() or leitung_id = auth.uid());

-- Löschen: Admin alles; SL nur eigene.
drop policy if exists gespraechsprotokolle_delete on public.gespraechsprotokolle;
create policy gespraechsprotokolle_delete on public.gespraechsprotokolle
  for delete to authenticated
  using (public.is_admin() or leitung_id = auth.uid());
