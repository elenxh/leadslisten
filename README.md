# Tutorio Akquise

Akquise-Web-App für **Tutorio Deutschland (Gratisnachhilfe.de)**. Standortleitungen
verwalten den Akquise-Status von Schulen (Telefonate, Wiedervorlagen, Notizen);
der Admin sieht und bearbeitet alles live.

## Tech-Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (base-ui Registry)
- **Supabase** – Auth (E-Mail + Passwort), Datenbank & Realtime (`@supabase/ssr`)

## Lokal starten

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Environment-Variablen anlegen
cp .env.example .env.local   # Werte sind bereits eingetragen (öffentliche Client-Keys)

# 3. Dev-Server starten
npm run dev
```

App läuft dann auf **http://localhost:3000**. Ohne Anmeldung wirst du automatisch
auf `/login` umgeleitet. Melde dich mit deinem Admin-Account (E-Mail + Passwort) an.

Weitere Befehle: `npm run build` (Produktions-Build), `npm run start` (Build starten),
`npm run lint`.

## Routen

| Route               | Beschreibung                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| `/login`            | Anmeldung mit E-Mail + Passwort                                        |
| `/dashboard`        | Statistik-Kacheln, Tabs, Filter, Schul-Karten                          |
| `/schule/[id]`      | Schul-Detail: Kontakt, Status/Wiedervorlage/Notiz, Anruf-Historie      |
| `/passwort-aendern` | Passwort setzen (erzwungen beim ersten Login via `passwort_geaendert`) |
| `/admin/leitungen`  | **Admin:** Leitungen auflisten, anlegen (Login + Temp-Passwort), (de)aktivieren |
| `/admin/import`     | **Admin:** Excel-Import (Lilly-Format .xlsx), Preview + Zuweisung |

## Architektur

- `lib/supabase/{client,server,middleware}.ts` – Supabase-Clients für Browser,
  Server-Components und Middleware (Session-Refresh + Routenschutz).
- `middleware.ts` – schützt alle Routen außer `/login`.
- `lib/auth.ts` – `requireLeitung()` lädt das eingeloggte Profil aus `leitungen`.
- `lib/types.ts` – TypeScript-Typen zum bestehenden DB-Schema
  (`leitungen`, `schulen`, `anrufe`).
- `lib/status.ts` – Status-Labels/-Farben & Anruf-Typen.
- `lib/berlin-ring.ts` – Hilfsfunktion: Ort → Berlin-Ring (1–4).
- `lib/dates.ts` – „heute fällig", „überfällig", „diese Woche".
- `components/app/*` – App-spezifische Komponenten (Header, Karten, Badges,
  Avatar, Anruf-Dialog).

## Rollen & Rechte

- **Standortleitung**: bearbeitet nur Schulen mit `zustaendig = eigene ID`,
  sieht alle übrigen read-only.
- **Admin**: bearbeitet alles, sieht zuständige Leitung je Schule (Avatar),
  kann Schulen einer Leitung zuweisen.

Die eigentliche Durchsetzung erfolgt über die **RLS-Policies** in Supabase;
die UI spiegelt die Rechte (Felder werden bei fehlender Berechtigung
deaktiviert).

## Leitungen anlegen (Admin)

Unter `/admin/leitungen` kann ein Admin neue Leitungen anlegen. Das Erstellen
von Auth-Usern läuft über eine **Server Action** (`app/admin/leitungen/actions.ts`)
mit dem Supabase **Service-Role-Key** – dieser ist geheim und wird nur
serverseitig verwendet (`lib/supabase/admin.ts`), nie im Browser.

**Voraussetzung:** Trage den Service-Role-Key in `.env.local` ein:

```
SUPABASE_SERVICE_ROLE_KEY=...   # Supabase → Project Settings → API → service_role
```

Beim Anlegen wird ein **temporäres Passwort** erzeugt und einmalig angezeigt
(zum Weitergeben). Die neue Leitung muss es beim ersten Login ändern
(`passwort_geaendert = false`).

## Excel-Import (Admin)

Unter `/admin/import` importiert ein Admin Akquise-Listen im **Lilly-Format**
(`.xlsx`): mehrere Sheets je Schulart, Daten ab **Zeile 4**, Spalten **A–I**
(A Schulname, B Bezirk, C Schulart, D Homepage, E Ansprechpartner, F Rolle,
G E-Mail, H Telefon, I Notiz/Adresse → `notiz_original`).

- Die Datei wird im Browser geparst (Drag & Drop), Preview zeigt die ersten 10
  Schulen + Anzahl je Sheet. Der eigentliche Schreibvorgang läuft als
  **Server Action** (`app/admin/import/actions.ts`) mit dem Service-Role-Key.
- **Ring** wird automatisch aus der Stadt (= erster Teil des Bezirks) berechnet
  (`lib/berlin-ring.ts`); Schulen außerhalb Brandenburgs → Ring `null`.
- **Duplikate** (Name + Bezirk): nur **Stammdaten** werden aktualisiert.
  `status`, `naechster_anruf`, `akquise_notiz` und die bestehende
  **Zuständigkeit** bleiben unangetastet. Neue Schulen erhalten Status `neu`
  und die im Dropdown gewählte zuständige Leitung.
