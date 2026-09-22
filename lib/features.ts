// Zentrale Feature-Schalter (rein clientseitige Sichtbarkeit; keine DB-Wirkung).
//
// AUFGABEN_AKTIV: steuert die Sichtbarkeit des Aufgaben-Features in der UI.
// Auf `false` ist das Feature überall ausgeblendet – der Header-Reiter,
// die Dashboard-Box „Meine Aufgaben" und die Aufgaben-Anzeige im
// Stundennachweis verschwinden. Code, Route (/aufgaben bleibt per URL
// erreichbar) und Datenbank-Tabellen bleiben unangetastet. Zum Wieder-
// aktivieren einfach auf `true` stellen – kein Umbau, keine Migration nötig.
export const AUFGABEN_AKTIV = false;
