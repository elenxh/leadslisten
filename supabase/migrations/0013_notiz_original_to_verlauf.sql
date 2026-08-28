-- =====================================================================
-- DATENMIGRATION: notiz_original-Anrufe -> anrufe (Verlauf)  [Berlin]
-- =====================================================================
-- Zweiter Alt-Daten-Bestand (~681 Berliner Schulen), den 0011 NICHT erwischt
-- hat. Quelle ist schulen.notiz_original (in der App als "Ursprungsnotiz"),
-- Format: ein Fließsatz, "|"-getrennt, z. B.
--   Notiz Akquiseverlauf: Erreicht, haben schon einen Träger | Anruf am: 04.05.2026
--   | Tage: 52 | Pre Call Info: an sek ... | Status Akquise: Kein Interesse
-- Auch die Tippfehler-Variante "Notiz Aquise:" (ohne k, ohne "verlauf") wird
-- erkannt.
--
-- ACHTUNG: verändert Daten. Erst NACH 0010/0011/0012 ausführen. Atomar
-- (BEGIN/COMMIT) und re-run-sicher: nach dem Lauf enthält notiz_original kein
-- "Anruf am" mehr, ein zweiter Lauf findet also nichts.
--
-- Regeln (mit dem User abgestimmt):
--  0) Backup: kompletter notiz_original -> notiz_original_backup (nur einmal).
--  1) Ein Datum pro Notiz (kein Mehrfachfall). Je "Anruf am: TT.MM.JJJJ" ein
--     anrufe-Eintrag als ALT-IMPORT: leitung_id/status_neu/ergebnis = NULL,
--     typ = 'sonstiges' -> zählt NICHT als "erreicht", keine "nicht erreicht"-
--     Serie, kein Stundennachweis, Anzeige "Alt-Import".
--     Verlaufstext je Eintrag:
--       a) Ergebnistext vorhanden (nach "Notiz Akquiseverlauf:"/"Notiz Aquise:"
--          bis zum ersten "|") UND enthält "nicht erreich…" -> "nicht erreichbar".
--       b) Ergebnistext vorhanden, sonst                    -> dieser Text.
--       c) Datum, aber KEIN Ergebnistext (Notiz beginnt mit "Anruf am:")
--                                                            -> "Dokumente versendet, keine Rückmeldung".
--  2) Status – nur ein eng begrenzter Eingriff: ausschließlich Schulen, die
--     aktuell auf 'Neu' stehen (~9), dürfen den Status aus dem "Status Akquise:"-
--     Text übernehmen (gemappt auf die 9 gültigen Werte). Nicht sauber
--     zuordenbar -> bleibt 'Neu'. Schulen mit anderem Status: NIE angefasst.
--  3) Aus notiz_original nur die Anruf-Segmente entfernen (Notiz Akquiseverlauf:/
--     Notiz Aquise:, Anruf am:, Tage:, Status Akquise:); der Rest (Pre Call Info
--     etc.) bleibt drin. akquise_notiz wird NICHT angefasst.
--  4) Ampel-Referenz letzter_anruf_am nur anheben, nie senken.
-- =====================================================================

begin;

-- 0a) Backup-Spalte (idempotent).
alter table public.schulen
  add column if not exists notiz_original_backup text;

-- 0b) Alt-Import zulassen (idempotent; steht auch in 0010/0011): kein Urheber,
--     kein Status. leitung_id + status_neu müssen NULL erlauben.
alter table public.anrufe alter column leitung_id drop not null;
alter table public.anrufe alter column status_neu drop not null;

-- 1) Komplettes Backup von notiz_original (nur einmal – re-run-sicher).
update public.schulen
  set notiz_original_backup = notiz_original
  where notiz_original ilike '%Anruf am%'
    and notiz_original_backup is null;

-- 2) Je "Anruf am:"-Datum einen Alt-Import-Eintrag in anrufe anlegen.
with quellen as (
  select
    s.id as schule_id,
    -- Anruf-Datum (roh, TT.MM.JJ oder TT.MM.JJJJ):
    substring(s.notiz_original from 'Anruf am:\s*(\d{1,2}\.\d{1,2}\.\d{2,4})') as datum_roh,
    -- Ergebnistext nach "Notiz Akquiseverlauf:"/"Notiz Aquise:" bis zum ersten "|":
    nullif(btrim(substring(
      s.notiz_original from 'Notiz\s+Ak?quise(?:verlauf)?:\s*([^|]*)'
    )), '') as ergebnis_text
  from public.schulen s
  where s.notiz_original ilike '%Anruf am%'
    and s.notiz_original ~ 'Anruf am:\s*\d{1,2}\.\d{1,2}\.\d{2,4}'
)
insert into public.anrufe (schule_id, leitung_id, datum, typ, status_neu, ergebnis, text)
select
  q.schule_id,
  null,
  ((case
      when q.datum_roh ~ '\d{1,2}\.\d{1,2}\.\d{4}'
        then to_date(q.datum_roh, 'DD.MM.YYYY')
      else to_date(q.datum_roh, 'DD.MM.YY')
    end)::timestamp + interval '12 hours'),
  'sonstiges',
  null,
  null,
  case
    when q.ergebnis_text is not null and q.ergebnis_text ~* 'nicht\s+erreich'
      then 'nicht erreichbar'
    when q.ergebnis_text is not null
      then q.ergebnis_text
    else 'Dokumente versendet, keine Rückmeldung'
  end
from quellen q
where q.datum_roh is not null;

-- 3) Status NUR für Schulen anheben, die aktuell auf 'Neu' stehen und einen sauber
--    zuordenbaren "Status Akquise:"-Text haben. Muss VOR dem Strippen laufen
--    (danach ist "Status Akquise:" aus notiz_original entfernt).
update public.schulen s
set status = m.neu_status
from (
  select
    s2.id,
    case lower(btrim(substring(s2.notiz_original from 'Status\s+Akquise:\s*([^|]*)')))
      when 'neu'                    then 'Neu'
      when 'nicht erreichbar'       then 'Nicht erreichbar'
      when 'nicht erreicht'         then 'Nicht erreichbar'
      when 'erstkontakt'            then 'Erreicht'
      when 'erreicht'               then 'Erreicht'
      when 'dokumente verschickt'   then 'Unterlagen raus'
      when 'unterlagen raus'        then 'Unterlagen raus'
      when 'konzept wird weitergeleitet' then 'Unterlagen raus'
      when 'im gespräch'            then 'Im Gespräch'
      when 'im gespraech'           then 'Im Gespräch'
      when 'wiedervorlage anruf'    then 'Im Gespräch'
      when 'wiedervorlage'          then 'Im Gespräch'
      when 'persönliches kennenlernen'  then 'Termin/Kennenlernen'
      when 'persoenliches kennenlernen' then 'Termin/Kennenlernen'
      when 'termin/kennenlernen'    then 'Termin/Kennenlernen'
      when 'termin'                 then 'Termin/Kennenlernen'
      when 'kennenlernen'           then 'Termin/Kennenlernen'
      when 'kooperationsabschluss'  then 'Abschluss'
      when 'kooperation'            then 'Abschluss'
      when 'abschluss'              then 'Abschluss'
      when 'kein interesse'         then 'Kein Interesse'
      when 'anderer anbieter'       then 'Anderer Anbieter'
      else null
    end as neu_status
  from public.schulen s2
  where s2.status = 'Neu'
    and s2.notiz_original ilike '%Anruf am%'
    and s2.notiz_original ilike '%Status Akquise%'
) m
where m.id = s.id
  and m.neu_status is not null
  and s.status = 'Neu';

-- 4) Anruf-Segmente aus notiz_original entfernen, Rest (Reihenfolge erhalten)
--    zusammensetzen. Entfernt: "Notiz Akquiseverlauf:"/"Notiz Aquise:", "Anruf am:",
--    "Tage:", "Status Akquise:". Alles andere (Pre Call Info etc.) bleibt.
--    Danach enthält notiz_original kein "Anruf am" mehr -> re-run-sicher.
update public.schulen s
set notiz_original = nullif(
  btrim((
    select string_agg(btrim(p.seg), ' | ' order by p.ord)
    from regexp_split_to_table(s.notiz_original, '\|')
           with ordinality as p(seg, ord)
    where btrim(p.seg) !~* '^(Notiz\s+Ak?quise|Anruf\s+am|Tage|Status\s+Akquise)'
  )),
  ''
)
where s.notiz_original ilike '%Anruf am%';

-- 5) Ampel-Referenz nachziehen: letzter_anruf_am = jüngstes Anruf-Datum je Schule
--    (inkl. der neu importierten Einträge). Nur anheben, nie senken -> idempotent.
update public.schulen s
set letzter_anruf_am = sub.maxd
from (
  select schule_id, max(datum::date) as maxd
  from public.anrufe
  group by schule_id
) sub
where sub.schule_id = s.id
  and (s.letzter_anruf_am is null or s.letzter_anruf_am < sub.maxd);

-- Denormalisierte Marker (letztes_ergebnis / nicht_erreicht_serie) bleiben
-- 0/NULL: die migrierten Einträge haben ergebnis = NULL (unbekannt) und zählen
-- daher NICHT als "nicht erreicht".

commit;
