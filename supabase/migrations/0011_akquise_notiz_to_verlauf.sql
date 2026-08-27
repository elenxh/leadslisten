-- =====================================================================
-- DATENMIGRATION: akquise_notiz-Verläufe -> anrufe (Verlauf)
-- =====================================================================
-- ACHTUNG: verändert Daten. Erst NACH 0010 ausführen. Nur EINMAL laufen lassen
-- (die Transaktion ist atomar; bei Erfolg sind die datierten Zeilen aus
-- akquise_notiz entfernt, ein zweiter Lauf findet dann nichts mehr).
--
-- Regeln:
--  1) Komplettes Backup von akquise_notiz -> akquise_notiz_backup (nur einmal).
--  2) Datierte Zeilen ("TT.MM.JJ · Text" / "TT.MM.JJJJ …") -> anrufe
--     (Datum + Text; ergebnis = NULL = neutral/"protokolliert"; typ='sonstiges';
--      leitung_id = NULL).
--  3) Diese Zeilen + eine evtl. "── Kontaktverlauf ──"-Überschrift aus
--     akquise_notiz entfernen; der Rest (── Weitere Infos ──, Öffnungszeiten,
--     Träger etc.) bleibt unverändert.
-- =====================================================================

begin;

-- 0) Alt-Import ohne bekannten Urheber zulassen (idempotent; steht auch in
--    0010). Historien-Zeilen werden mit leitung_id = NULL angelegt.
alter table public.anrufe alter column leitung_id drop not null;

-- 1) Backup (nur einmal – re-run-sicher).
update public.schulen
  set akquise_notiz_backup = akquise_notiz
  where akquise_notiz is not null
    and akquise_notiz_backup is null;

-- 2) Datierte Verlaufszeilen als anrufe-Einträge anlegen.
insert into public.anrufe (schule_id, leitung_id, datum, typ, status_neu, ergebnis, text)
select
  s.id,
  null,
  ((case
      when t.line ~ '^\s*\d{1,2}\.\d{1,2}\.\d{4}'
        then to_date(substring(t.line from '^\s*(\d{1,2}\.\d{1,2}\.\d{4})'), 'DD.MM.YYYY')
      else to_date(substring(t.line from '^\s*(\d{1,2}\.\d{1,2}\.\d{2})'), 'DD.MM.YY')
    end)::timestamp + interval '12 hours'),
  'sonstiges',
  null,
  null,
  nullif(btrim(regexp_replace(t.line, '^\s*\d{1,2}\.\d{1,2}\.\d{2,4}\s*[·\-–:]*\s*', '')), '')
from public.schulen s,
     lateral regexp_split_to_table(coalesce(s.akquise_notiz, ''), E'\n') as t(line)
where t.line ~ '^\s*\d{1,2}\.\d{1,2}\.\d{2,4}';

-- 3) Datierte Zeilen + "Kontaktverlauf"-Überschrift aus akquise_notiz entfernen,
--    Rest (Reihenfolge erhalten) zusammensetzen.
update public.schulen s
set akquise_notiz = nullif(
  btrim(
    (
      select string_agg(x.line, E'\n' order by x.ord)
      from regexp_split_to_table(coalesce(s.akquise_notiz, ''), E'\n')
             with ordinality as x(line, ord)
      where not (x.line ~ '^\s*\d{1,2}\.\d{1,2}\.\d{2,4}')
        and not (x.line ~* '^\s*─+.*kontaktverlauf.*─*\s*$')
    )
  ),
  ''
)
where s.akquise_notiz is not null
  and s.akquise_notiz ~ '\d{1,2}\.\d{1,2}\.\d{2,4}';

-- Denormalisierte Marker bleiben 0/NULL: die migrierten Einträge haben
-- ergebnis = NULL (unbekannt) und zählen daher NICHT als "nicht erreicht".

commit;
