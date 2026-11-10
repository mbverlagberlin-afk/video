# OneClean – Kalender & Android aufräumen

Eine App von **OneMultimedia** (MB Verlag & Media Sounds).

OneClean räumt deinen Kalender und deine Android-Geräte auf und hält sich selbst aktuell.

## Funktionen

| Bereich | Was OneClean macht |
|---|---|
| **Kalender** | Findet doppelte Termine (gleicher Titel, gleiche Zeit) und alte, abgelaufene Einzeltermine (6–36 Monate) in allen Kalendern – inkl. Google-Kalender. Serientermine bleiben unberührt. |
| **Speicher** | Zeigt den belegten Speicher und findet alte APK-Dateien, temporäre Dateien, Logs, Vorschaubilder-Cache, leere Ordner und große Dateien (>100 MB). Nichts wird ohne Bestätigung gelöscht. |
| **Apps** | Listet Apps, die seit 30/60/90/180 Tagen nicht geöffnet wurden, mit Größe – Deinstallieren oder Cache leeren per Tipp. |
| **Updates** | Selbst-Update über GitHub Releases (Hinweis beim Start, Download und Installation in der App), Absprung zu System-Update und Play Store, Liste der am längsten nicht aktualisierten Apps. |
| **Mehrere Geräte** | PC-Tool `tools/oneclean_multi.py` räumt alle verbundenen Geräte gleichzeitig auf. |

Mindestens Android 8.0, getestet für Android 8–15.

## Installation

1. Unter **Releases** die neueste `OneClean-x.y.z.apk` herunterladen.
2. Auf dem Handy öffnen und „Installation aus unbekannten Quellen“ für den Browser/Dateimanager erlauben.
3. Beim ersten Öffnen der Bereiche die jeweiligen Berechtigungen erteilen (Kalender, Dateizugriff, Nutzungsdatenzugriff).

Spätere Updates meldet OneClean selbst.

## Mehrere Geräte

Das Tool **OneClean Multi** (`tools/oneclean_multi.py`, liegt auch jedem Release bei) läuft auf dem PC:

1. [Android Platform-Tools](https://developer.android.com/tools/releases/platform-tools) installieren (enthält `adb`) und Python 3 installieren.
2. Auf jedem Gerät: *Einstellungen → Über das Telefon → 7× auf Build-Nummer tippen*, dann *Entwickleroptionen → USB-Debugging* einschalten.
3. Geräte per USB anschließen (oder per WLAN: *Wireless-Debugging* → `python oneclean_multi.py wlan 192.168.x.x:port`).
4. `python oneclean_multi.py` starten und im Menü wählen:
   - App-Caches auf allen Geräten leeren
   - Junk-Dateien suchen und löschen
   - Apps auflisten / auf allen Geräten deinstallieren
   - OneClean auf allen Geräten installieren bzw. aktualisieren

Kalender: Google-Kalender werden über das Konto synchronisiert – einmal mit OneClean aufräumen genügt für alle Geräte.

## Neue Version veröffentlichen

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions baut die APK automatisch und hängt sie an das Release an. Alle installierten Apps erkennen das Update beim nächsten Start.

### Signatur (wichtig für Updates)

Updates lassen sich nur installieren, wenn jede Version mit demselben Schlüssel signiert ist. Dafür im Repository unter *Settings → Secrets and variables → Actions* anlegen:

| Secret | Inhalt |
|---|---|
| `KEYSTORE_BASE64` | Keystore-Datei als Base64 |
| `KEYSTORE_PASSWORD` | Passwort des Keystores |
| `KEY_ALIAS` | Alias des Schlüssels |
| `KEY_PASSWORD` | Passwort des Schlüssels |

Ohne diese Secrets wird mit einem Test-Schlüssel signiert, der bei jedem Build wechselt – dann funktioniert das Selbst-Update nicht.

## Selbst bauen

Android Studio öffnen → Projekt-Ordner wählen → *Build → Build APK(s)*.

## Hinweise zu Android-Grenzen

- Den Cache **anderer** Apps darf eine normale App seit Android 8 nicht direkt löschen. OneClean öffnet dafür die passende Systemseite; das PC-Tool kann es per `adb` für alle Apps auf einmal.
- Andere Apps aktualisieren darf nur der Play Store; OneClean führt dich direkt dorthin.
- Wegen der Berechtigungen „Alle Dateien“ und „Alle Apps sehen“ ist OneClean für den Vertrieb über die eigene Website/GitHub gedacht. Für den Play Store müssten diese Funktionen begründet bzw. reduziert werden.
