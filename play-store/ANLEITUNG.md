# OneClean im Google Play Store veröffentlichen

Diese Schritte erledigst du in der [Play Console](https://play.google.com/console). Alles, was du einfügen oder
hochladen musst, liegt in diesem Ordner `play-store/`.

## 0. Vorab wichtig

- **Privates Entwicklerkonto?** Bei privaten Konten, die nach dem 13.11.2023 angelegt wurden, verlangt Google vor
  der Veröffentlichung einen **geschlossenen Test mit mindestens 12 Testern über 14 Tage**. Erst danach kannst du
  den Zugriff auf die „Produktion“ beantragen. Für Organisationskonten (mit D-U-N-S-Nummer) gilt das nicht.
- **Upload-Schlüssel sicher aufbewahren:** `oneclean-upload.jks` und das Passwort an zwei sicheren Orten speichern
  (z. B. Passwort-Manager und USB-Stick). Ohne den Schlüssel kannst du keine Updates hochladen (Google kann ihn
  nur über den Support zurücksetzen, das dauert).

## 1. App anlegen

*Alle Apps → App erstellen*

- App-Name: `OneClean – Kalender & Speicher`
- Standardsprache: Deutsch – de-DE
- App oder Spiel: **App**
- Kostenlos oder kostenpflichtig: **Kostenlos** (Pro wird als In-App-Kauf verkauft)
- Erklärungen bestätigen → *App erstellen*

## 2. Zahlungsprofil (für Einnahmen)

*Einstellungen → Zahlungsprofil*: Zahlungsprofil anlegen und mit dem Entwicklerkonto verknüpfen
(Name/Firma, Adresse, Bankverbindung, Steuerangaben). **Ohne Zahlungsprofil kannst du keine In-App-Käufe verkaufen.**

## 3. Store-Eintrag

*Wachstum → Store-Präsenz → Haupteintrag im Play Store*

- Texte aus `store-eintrag.md` einfügen
- App-Symbol: `grafiken/icon-512.png`
- Vorstellungsgrafik: `grafiken/feature-grafik-1024x500.png`
- **Screenshots (mind. 2, besser 4–6):** Test-APK auf dem Handy installieren und je einen Screenshot machen von:
  Übersicht, Kalender mit gefundenen Duplikaten, Speicher nach einem Scan, Pro-Seite.

## 4. App-Inhalte (Richtlinien)

*Richtlinien → App-Inhalte* – jeden Punkt bearbeiten:

| Punkt | Antwort |
|---|---|
| Datenschutzerklärung | Öffentliche URL von `datenschutz.html` (vorher die Platzhalter in [eckigen Klammern] ausfüllen!) |
| App-Zugriff | Alle Funktionen ohne Anmeldung verfügbar |
| Anzeigen | Nein, die App enthält keine Werbung |
| Einstufung des Inhalts | Fragebogen: Kategorie „Dienstprogramm/Tools“, alle Fragen zu Gewalt, Sexualität usw. mit **Nein** |
| Zielgruppe | 18 und älter (oder 13+) – **nicht** an Kinder gerichtet |
| Datensicherheit | „Erhebt oder teilt Ihre App …?“ → **Nein**. Begründung: Alles wird nur auf dem Gerät verarbeitet. |
| Behörden-, Finanz-, Gesundheits-App | Nein |
| Nachrichten-App | Nein |

## 5. Erste Version hochladen

1. *Testen und veröffentlichen → Testen → Interner Test → Neuen Release erstellen*
2. **Play App-Signatur:** „Weiter“ / von Google verwalten lassen (Standard).
3. Datei `OneClean-1.0.0-….aab` hochladen (die signierte Datei, die du von Claude bekommen hast).
4. Release-Name z. B. `1.0.0`, Versionshinweise: `Erste Version`.
5. Unter *Tester* eine E-Mail-Liste mit deiner eigenen Google-Adresse anlegen → Release überprüfen → Einführen.

## 6. „OneClean Pro“ als Produkt anlegen

Erst möglich, **nachdem** ein App Bundle hochgeladen ist (Schritt 5).

*Monetarisieren → Produkte → In-App-Produkte → Produkt erstellen*

- Produkt-ID: **`oneclean_pro`** (genau so – die App sucht nach dieser ID)
- Name: `OneClean Pro`
- Beschreibung: `Unbegrenzt löschen und ungenutzte Apps finden – einmal kaufen, kein Abo.`
- Preis: z. B. **2,99 €** (Google rechnet die anderen Länder automatisch um)
- Speichern → **Aktivieren**

Zum Testen ohne echte Zahlung: *Einstellungen → Lizenztests* → deine Google-Adresse eintragen.

## 7. Geschlossener Test → Produktion

1. *Geschlossener Test* anlegen, dasselbe App Bundle hochladen, **mindestens 12 Tester** (Google-Adressen) einladen.
   Die Tester müssen über den Opt-in-Link beitreten und die App installieren.
2. Nach 14 Tagen: *Dashboard → Zugriff auf Produktion beantragen*.
3. Dann *Produktion → Neuer Release* → Länder auswählen → zur Überprüfung senden.
   Die Prüfung durch Google dauert meist einige Tage.

## 8. Spätere Updates

Damit GitHub neue Versionen gleich richtig signiert, im Repository unter
*Settings → Secrets and variables → Actions → New repository secret* anlegen:

| Secret | Inhalt |
|---|---|
| `KEYSTORE_BASE64` | Inhalt der Datei `oneclean-upload.jks.base64.txt` |
| `KEYSTORE_PASSWORD` | Passwort aus `upload-schluessel-passwort.txt` |
| `KEY_ALIAS` | `oneclean-upload` |
| `KEY_PASSWORD` | dasselbe Passwort |

Dann eine neue Version mit einem Tag bauen lassen (z. B. `v1.0.1`). Das signierte `.aab` erscheint im Release
bzw. bei den Actions-Artefakten und wird in der Play Console unter *Neuer Release* hochgeladen.
