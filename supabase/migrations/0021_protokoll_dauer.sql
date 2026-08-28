-- =====================================================================
-- Dauer eines 1:1-Gesprächsprotokolls (Minuten) – für die Meeting-Kopplung im
-- Stundennachweis. NULL = zählt (noch) nicht als Meeting-Zeit ("Dauer fehlt").
-- Keine Vorbelegung; bei neuen Protokollen Pflicht (App-seitig), bei alten
-- nachtragbar. Idempotent. Keine RLS-Änderung (gespraechsprotokolle hat Policies).
-- =====================================================================

alter table public.gespraechsprotokolle
  add column if not exists dauer_minuten integer
  check (dauer_minuten is null or dauer_minuten > 0);
