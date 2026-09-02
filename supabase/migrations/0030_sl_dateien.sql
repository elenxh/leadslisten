-- =====================================================================
-- Datei-Ablage pro SL: Ordnerbaum (sl_ordner, self-reference) + Dateien
-- (sl_dateien, Metadaten). Die eigentlichen Dateien liegen im PRIVATEN
-- Storage-Bucket „sl-dateien" unter dem Pfad {leitung_id}/... — Zugriff nur
-- über serverseitig signierte URLs nach Rechteprüfung.
-- Idempotent. Wiederverwendet is_admin().
--
-- Rechte: SL voller Zugriff auf EIGENEN Baum (leitung_id = auth.uid());
-- Admin alles.
-- =====================================================================

create table if not exists public.sl_ordner (
  id          uuid primary key default gen_random_uuid(),
  leitung_id  uuid not null references public.leitungen(id) on delete cascade,
  name        text not null,
  parent_id   uuid references public.sl_ordner(id) on delete cascade, -- NULL = oberste Ebene
  erstellt_am timestamptz not null default now()
);
create index if not exists sl_ordner_leitung_idx
  on public.sl_ordner(leitung_id, parent_id);

create table if not exists public.sl_dateien (
  id              uuid primary key default gen_random_uuid(),
  leitung_id      uuid not null references public.leitungen(id) on delete cascade,
  ordner_id       uuid references public.sl_ordner(id) on delete cascade, -- NULL = Wurzel
  dateiname       text not null,
  storage_pfad    text not null,
  groesse         bigint not null,
  mime_type       text,
  hochgeladen_von uuid references public.leitungen(id) on delete set null,
  erstellt_am     timestamptz not null default now()
);
create index if not exists sl_dateien_leitung_idx
  on public.sl_dateien(leitung_id, ordner_id);

-- --- RLS: Metadaten-Tabellen -------------------------------------------
alter table public.sl_ordner enable row level security;
drop policy if exists sl_ordner_all on public.sl_ordner;
create policy sl_ordner_all on public.sl_ordner
  for all to authenticated
  using (public.is_admin() or leitung_id = auth.uid())
  with check (public.is_admin() or leitung_id = auth.uid());

alter table public.sl_dateien enable row level security;
drop policy if exists sl_dateien_all on public.sl_dateien;
create policy sl_dateien_all on public.sl_dateien
  for all to authenticated
  using (public.is_admin() or leitung_id = auth.uid())
  with check (public.is_admin() or leitung_id = auth.uid());

-- =====================================================================
-- STORAGE: privater Bucket + Policies.
-- Alternativ kann der Bucket im Dashboard angelegt werden
-- (Storage → New bucket → Name „sl-dateien", „Public" AUS). Die App nutzt
-- ohnehin den Service-Role-Key + eigene Rechteprüfung; die folgenden Policies
-- sind Defense-in-depth für direkten Storage-Zugriff.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('sl-dateien', 'sl-dateien', false)
on conflict (id) do nothing;

-- Erstes Pfad-Segment = leitung_id -> nur eigener Ordner (bzw. Admin alles).
drop policy if exists sl_dateien_obj_select on storage.objects;
create policy sl_dateien_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sl-dateien'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists sl_dateien_obj_insert on storage.objects;
create policy sl_dateien_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sl-dateien'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists sl_dateien_obj_update on storage.objects;
create policy sl_dateien_obj_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'sl-dateien'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists sl_dateien_obj_delete on storage.objects;
create policy sl_dateien_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'sl-dateien'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );
