-- =====================================================================
-- Träger-Kategorie: soziale Träger (typ='traeger') in 4 Gruppen einteilen.
-- Reine Übersicht/Filter (wie die Schularten-Reiter bei Schulen) – kein
-- eigener Prozess, Status/Ampel/Fällig-Logik unverändert.
-- Idempotent. Migration einmalig ausführen (Bestand wird initial vorsortiert).
-- =====================================================================

-- Spalte (für Schulen belanglos, aber NOT NULL default hält es einfach).
alter table public.schulen
  add column if not exists traeger_kategorie text not null default 'Sonstige';

alter table public.schulen drop constraint if exists schulen_traeger_kategorie_check;
alter table public.schulen add constraint schulen_traeger_kategorie_check
  check (traeger_kategorie in (
    'Kirchliche Gemeinde', 'Jugendeinrichtung', 'Verein', 'Sonstige'
  ));

-- Bestand initial vorsortieren (nur Träger). Reihenfolge: kirchlich vor Verein,
-- damit z. B. „Kirchengemeinde e.V." kirchlich wird. Einzelfälle danach von Hand.
update public.schulen set traeger_kategorie = case
  when lower(name) ~ '(gemeinde|kirche|kirch|ev\.|evangelisch|kath\.|katholisch|pfarr)'
    then 'Kirchliche Gemeinde'
  when lower(name) ~ '(jugend|jugendclub|jugendtreff|jugendhaus|jfe)'
    then 'Jugendeinrichtung'
  when lower(name) ~ '(e\.v|e\. v\.|verein)'
    then 'Verein'
  else 'Sonstige'
end
where typ = 'traeger';
