-- =====================================================================
-- NACHZUG: verwaiste ISO-Datumszeilen in akquise_notiz -> Verlaufseinträge
-- =====================================================================
-- Problem: Nach 0011/0013 stehen in manchen akquise_notiz-Feldern (oft unter
-- „— Hinweise —") noch nackte Datumszeilen im Format „JJJJ-MM-TT 00:00:00"
-- (bzw. „JJJJ-MM-TT"). 0011 hat nur „TT.MM.JJ · Text" geparst; diese ISO-Zeilen
-- ohne Text fielen durch -> der jeweilige Kontaktversuch fehlt im Verlauf.
--
-- ACHTUNG: verändert Daten. Erst NACH 0010–0013 ausführen. Atomar (BEGIN/COMMIT)
-- und re-run-sicher (zweiter Lauf legt nichts doppelt an).
--
-- Regeln (mit Elena abgestimmt):
--  * Je (Schule, Datum) EIN Alt-Import-Eintrag in anrufe: leitung_id=NULL,
--    status_neu=NULL, ergebnis=NULL, typ='sonstiges' -> läuft über das
--    bestehende „Alt-Import"-Label, zählt NICHT als „erreicht", erhöht keine
--    „nicht erreicht"-Serie. Text: „Kontaktversuch (aus Alt-Import, ohne Notiz)".
--  * DUPLIKAT-SCHUTZ per Kalendertag: Eintrag nur, wenn für die Schule noch KEIN
--    anrufe-Eintrag mit datum::date = diesem Tag existiert (so entsteht der 04.11.
--    aus dem Beispiel – bereits als 12:00-Eintrag vorhanden – NICHT doppelt).
--  * Danach die Datumszeilen aus akquise_notiz entfernen; eine dadurch verwaiste
--    „— Hinweise —"-Überschrift am Ende sowie doppelte Leerzeilen aufräumen –
--    sonstiger Text bleibt unangetastet.
--  * schulen.status NICHT ändern. Der Trigger update_schule_nach_anruf() setzt
--    status = coalesce(new.status_neu, status); status_neu=NULL -> Status bleibt.
--  * akquise_notiz_backup NICHT anfassen (Backup existiert aus 0011).
--  * letzter_anruf_am nur anheben (Ampel spiegelt den nachgetragenen Kontakt).
-- =====================================================================

begin;

-- 1) Je (Schule, Datum) einen Alt-Import-Eintrag anlegen – nur wenn für diesen
--    Kalendertag noch KEIN anrufe-Eintrag existiert (Duplikat-Schutz + re-run-sicher).
with datumszeilen as (
  select
    s.id as schule_id,
    to_date(substring(btrim(line) from '^(\d{4}-\d{2}-\d{2})'), 'YYYY-MM-DD') as tag
  from public.schulen s,
       lateral regexp_split_to_table(coalesce(s.akquise_notiz, ''), E'\n') as line
  where btrim(line) ~ '^\d{4}-\d{2}-\d{2}( 00:00:00)?$'
),
eindeutig as (
  select distinct schule_id, tag from datumszeilen
)
insert into public.anrufe (schule_id, leitung_id, datum, typ, status_neu, ergebnis, text)
select
  e.schule_id,
  null,
  e.tag::timestamp + interval '12 hours',
  'sonstiges',
  null,
  null,
  'Kontaktversuch (aus Alt-Import, ohne Notiz)'
from eindeutig e
where not exists (
  select 1
  from public.anrufe a
  where a.schule_id = e.schule_id
    and a.datum::date = e.tag
);

-- 2) Verarbeitete Datumszeilen aus akquise_notiz entfernen + aufräumen.
--    Nur Zeilen anfassen, die EXAKT eine ISO-Datumszeile sind (line-anchored);
--    verwaiste „— Hinweise —"-Überschrift am Textende und doppelte Leerzeilen
--    entfernen. Gate: nur Schulen mit einer echten Datumszeile.
update public.schulen s
set akquise_notiz = nullif(
  btrim(
    -- (c) 3+ aufeinanderfolgende Zeilenumbrüche -> eine Leerzeile
    regexp_replace(
      -- (b) am Textende verbliebene „(—) Hinweise (—)"-Überschrift entfernen
      regexp_replace(
        -- (a) reine ISO-Datumszeilen entfernen (line-anchored, 'n' = ^/$ je Zeile)
        regexp_replace(
          coalesce(s.akquise_notiz, ''),
          '^[ \t]*\d{4}-\d{2}-\d{2}( 00:00:00)?[ \t]*$',
          '',
          'gn'
        ),
        '[—–―─=\-]*[ \t]*[Hh]inweise?[ \t]*[—–―─=\-]*[ \t\r\n]*$',
        '',
        'i'
      ),
      '(\r?\n[ \t]*){3,}',
      E'\n\n',
      'g'
    )
  ),
  ''
)
where s.akquise_notiz ~ '(^|\n)[ \t]*\d{4}-\d{2}-\d{2}( 00:00:00)?[ \t]*(\n|$)';

-- 3) Ampel-Referenz nachziehen: letzter_anruf_am = jüngstes Anruf-Datum je Schule
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

commit;

-- =====================================================================
-- ABSCHLUSS-KONTROLLE (read-only – nach dem Commit ausführen)
-- =====================================================================

-- 1) Muss 0 sein: keine verbleibenden Datumszeilen in akquise_notiz.
select count(*) as verbleibende_datumszeilen
from public.schulen s,
     lateral regexp_split_to_table(coalesce(s.akquise_notiz, ''), E'\n') as line
where btrim(line) ~ '^\d{4}-\d{2}-\d{2}( 00:00:00)?$';

-- 2) Anzahl der insgesamt durch diesen Nachzug angelegten Verlaufseinträge.
select count(*) as nachzug_eintraege
from public.anrufe
where text = 'Kontaktversuch (aus Alt-Import, ohne Notiz)';
