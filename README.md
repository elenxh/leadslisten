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

## Noch offen (spätere Phasen)

- Admin-Oberfläche zum **Anlegen neuer Leitungen** – das Erstellen von
  Auth-Usern benötigt den Supabase **Service-Role-Key** und muss daher über
  eine geschützte Server-Route/Edge-Function laufen (nicht mit dem
  Publishable Key im Browser möglich).
