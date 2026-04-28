# Dokumenten-App – Agent Briefing

## Was ist diese App?
Eine persönliche Web-App zur Erstellung und Verwaltung von Geschäftsdokumenten
(Rechnungen, Angebote, Mahnungen etc.) für Sebastian Wauer / Sport Voice.
Nur ein einziger Nutzer – kein SaaS, kein Multi-Tenant.

## Tech-Stack
- **Frontend:** React 19 + Vite + Tailwind CSS 4
- **Datenbank:** Supabase (PostgreSQL) – Projekt in Frankfurt (EU)
- **Auth:** Supabase Auth (E-Mail + Passwort, ein Account)
- **Hosting:** Vercel (auto-deploy aus GitHub main branch)
- **PDF-Export:** react-pdf (noch nicht installiert)
- **Word-Export:** docx (npm) (noch nicht installiert)

## Projektstruktur
src/
pages/          # Eine Datei pro Seite
components/     # Wiederverwendbare UI-Komponenten
lib/
supabase.js   # Supabase Client (bereits konfiguriert)

## Umgebungsvariablen (.env)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
Diese Datei existiert lokal, ist aber nicht in Git (steht in .gitignore).

## Datenbankschema (Supabase / PostgreSQL)
- **firmenprofile** – Name, Adresse, Logo, Steuernummer, §19-Status, IBAN,
  Nummernkreise pro Dokumenttyp
- **kunden** – Firma, Ansprechpartner, Adresse, USt-ID, Notizen
- **dokumente** – Typ, Nummer, Datum, Status, Firmenprofil-ID, Kunden-ID,
  Beträge, Bezugsdokument (für Mahnungen/Gutschriften)
- **positionen** – Zeilen eines Dokuments (Bezeichnung, Menge, Preis, Rabatt)
- **mahnungen** – Mahnstufe, Mahngebühr, Verzugszinsen (§ 288 BGB)

## Dokumenttypen
| Typ | Kürzel | Besonderheit |
|-----|--------|-------------|
| Rechnung | R-XXXXX | §14 UStG Pflichtangaben, §19 Hinweis automatisch |
| Angebot | A-XXXXX | Gültigkeitsdatum, per Klick in Rechnung umwandeln |
| Auftragsbestätigung | AB-XXXXX | Basis für spätere Rechnung |
| Mahnung | M-XXXXX | 3 Stufen, Mahngebühr + Verzugszinsen automatisch |
| Lieferschein | L-XXXXX | Ohne Preisangabe |
| Gutschrift | G-XXXXX | Bezug auf Originalrechnung |

## Aktuelle Seiten (bereits gebaut)
- `/login` – Login mit Supabase Auth (funktioniert)
- `/dashboard` – Übersicht mit Navigation (funktioniert)
- `/kunden` – Kundenverwaltung mit Bearbeitungsformular (funktioniert)
- `/dokumente` – Dokumentenliste mit Filtern und Detailansicht (funktioniert)
- `/einstellungen` – Firmenprofil, Layout und Stammdaten (funktioniert)

## Design-Regeln
- Schlicht, professionell, viel Weißraum
- Farben: Blau (#185FA5) als Akzentfarbe, Grau als Basis
- Keine bunten Hintergründe, keine Schatten-Exzesse
- Tailwind-Klassen – kein eigenes CSS schreiben
- Deutsch überall (Labels, Fehlermeldungen, Platzhalter)
- Alle Beträge im deutschen Format: 1.800,00 €

## Compliance-Regeln (wichtig!)
- Rechnungsnummern sind fortlaufend und unveränderlich (GoBD)
- Gespeicherte Dokumente werden nie gelöscht, nur storniert
- §19 UStG Hinweis: "Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet."
  – wird automatisch gesetzt wenn Firmenprofil §19 = true
- Pflichtfelder auf Rechnungen: Name+Adresse Aussteller, Name+Adresse Empfänger,
  Steuernummer/USt-ID, Datum, Rechnungsnummer, Leistungsbeschreibung,
  Leistungszeitraum, Netto/USt/Brutto

## Referenz-Rechnung (als Design-Vorlage)
Sport Voice · Buchenstraße 50 · 42283 Wuppertal
An: K. Drabiniok · Am Roten Haus 16 · 45359 Essen
Rechnung R-00039 · 23.02.2026
Position: Moderation GTWC Barcelona · 1.175,57 €
§19 UStG aktiv → keine Umsatzsteuer

## Was Codex beim Arbeiten beachten soll
- Immer erst bestehende Dateien lesen bevor etwas geändert wird
- Keine neuen Pakete installieren ohne es zu erwähnen
- Supabase-Abfragen immer mit Fehlerbehandlung (try/catch oder error-check)
- Nach jeder größeren Änderung: kurz erklären was geändert wurde und warum
- Keine Placeholder-Daten in die Datenbank schreiben
- .env niemals anfassen oder ausgeben
