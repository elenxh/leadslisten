-- =====================================================================
-- Auto-generierte Fülltexte aus Verlaufseinträgen (anrufe.text) entfernen.
-- Der Eintrag selbst (Datum, Ergebnis, Herkunfts-Badge „Alt-Import" über
-- fehlenden leitung_id) bleibt — nur der irreführende Text wird geleert.
-- Idempotent (mehrfaches Ausführen ändert nichts weiter).
-- =====================================================================

-- 1) Alt-Import-Platzhalter (exakter Text aus 0015).
update public.anrufe
  set text = null
  where text = 'Kontaktversuch (aus Alt-Import, ohne Notiz)';

-- 2) Generierte Status-Texte ohne echte Notiz. Die App erzeugte genau
--    „Status geändert auf <Status>" bzw. „Status bestätigt: <Status>";
--    echte Notizen folgen diesem Muster nicht.
update public.anrufe
  set text = null
  where text like 'Status geändert auf %'
     or text like 'Status bestätigt: %';
