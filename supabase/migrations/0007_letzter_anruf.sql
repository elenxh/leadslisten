-- =====================================================================
-- Phase 2: Ampel ab letztem echten Kontakt
-- =====================================================================
-- Idempotent. Im Supabase SQL-Editor ausführbar.
--
-- - schulen.letzter_anruf_am (date): Datum des jüngsten protokollierten
--   Anrufs je Schule (denormalisiert, damit die Liste die Ampel ohne
--   teure Aggregation berechnen kann).
-- - Backfill aus anrufe; Index auf (schule_id, datum).
-- =====================================================================

alter table public.schulen
  add column if not exists letzter_anruf_am date;

create index if not exists anrufe_schule_datum_idx
  on public.anrufe(schule_id, datum desc);

-- Backfill: jüngstes Anruf-Datum je Schule übernehmen.
update public.schulen s
set letzter_anruf_am = sub.maxd
from (
  select schule_id, max(datum::date) as maxd
  from public.anrufe
  group by schule_id
) sub
where sub.schule_id = s.id
  and (s.letzter_anruf_am is null or s.letzter_anruf_am < sub.maxd);
