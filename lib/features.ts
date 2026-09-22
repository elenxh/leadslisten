// Zentrale Feature-Schalter (Sichtbarkeit/Zugang; keine DB-Wirkung).
//
// AUFGABEN_AKTIV: steuert die Sichtbarkeit des Aufgaben-Features in der UI.
// Auf `false` ist das Feature überall ausgeblendet – der Header-Reiter,
// die Dashboard-Box „Meine Aufgaben" und die Aufgaben-Anzeige im
// Stundennachweis verschwinden. Code, Route (/aufgaben bleibt per URL
// erreichbar) und Datenbank-Tabellen bleiben unangetastet. Zum Wieder-
// aktivieren einfach auf `true` stellen – kein Umbau, keine Migration nötig.
export const AUFGABEN_AKTIV = false;

// IMPORT_FUER_SL: steuert, ob SLs den (Standard-)Import nutzen dürfen.
// Auf `false` ist der Import nur für Admins sichtbar und zugänglich – der
// Header-Reiter „Import" ist für SLs ausgeblendet und die Route /import ist
// für Nicht-Admins serverseitig gesperrt (Redirect + Abbruch der Server-
// Action), damit eine SL den Import auch nicht per Direkt-URL auslösen kann.
// Admin behält vollen Zugriff. Auf `true` ist der Import wie bisher für
// Admin UND SLs offen (SLs weiterhin nur eigene Standorte über RLS). Code,
// SL-Berechtigung und RLS bleiben unangetastet – kein Umbau, keine Migration.
export const IMPORT_FUER_SL = false;

