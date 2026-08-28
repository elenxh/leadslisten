-- =====================================================================
-- Admin-Kommentare/Markierungen im Stundennachweis. Für SL KOMPLETT unsichtbar.
-- KRITISCH: RLS erlaubt SELECT UND Schreiben NUR is_admin() -> eine SL kann die
-- Kommentare auch über die API nicht lesen. Idempotent.
-- Wiederverwendet: is_admin(), touch_updated_at().
--
-- datum NULL  = seitenweiter Kommentar (ganze Monatsseite),
-- datum gesetzt = Kommentar zu genau diesem Tag/Zeile.
-- =====================================================================

create table if not exists public.admin_kommentare (
  id             uuid primary key default gen_random_uuid(),
  leitung_id     uuid not null references public.leitungen(id) on delete cascade,
  zeitraum_start date not null,           -- Monatsseite (der 26.)
  datum          date,                    -- NULL = seitenweit, sonst der Tag/Zeile
  kommentar      text,
  farbe          text check (farbe is null or farbe in ('rot', 'gelb', 'gruen')),
  created_by     uuid references public.leitungen(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- je Tag genau ein Kommentar; je Monatsseite genau ein seitenweiter Kommentar.
create unique index if not exists admin_kommentare_tag_uidx
  on public.admin_kommentare(leitung_id, datum) where datum is not null;
create unique index if not exists admin_kommentare_seite_uidx
  on public.admin_kommentare(leitung_id, zeitraum_start) where datum is null;

drop trigger if exists admin_kommentare_touch on public.admin_kommentare;
create trigger admin_kommentare_touch before update on public.admin_kommentare
  for each row execute function public.touch_updated_at();

alter table public.admin_kommentare enable row level security;

-- KRITISCH: nur Admin – SELECT UND Schreiben. SL sieht/liest nichts.
drop policy if exists admin_kommentare_select on public.admin_kommentare;
create policy admin_kommentare_select on public.admin_kommentare
  for select to authenticated using (public.is_admin());
drop policy if exists admin_kommentare_write on public.admin_kommentare;
create policy admin_kommentare_write on public.admin_kommentare
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
