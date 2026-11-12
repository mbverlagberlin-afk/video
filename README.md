# OneClean – Kalender & Android aufräumen

Eine App von **OneMultimedia** (MB Verlag & Media Sounds).

OneClean räumt deinen Kalender und deine Android-Geräte auf.

## Funktionen

| Bereich | Was OneClean macht |
|---|---|
| **Kalender** | Findet doppelte Termine (gleicher Titel, gleiche Zeit) und alte, abgelaufene Einzeltermine (6–36 Monate) in allen Kalendern – inkl. Google-Kalender. Serientermine bleiben unberührt. |
| **Speicher** | Zeigt den belegten Speicher und findet alte APK-Dateien, temporäre Dateien, Logs, Vorschaubilder-Cache, leere Ordner und große Dateien (>100 MB). Ab Android 11 in den Ordnern, die der Nutzer freigibt. Nichts wird ohne Bestätigung gelöscht. |
| **Apps** | Listet Apps, die seit 30/60/90/180 Tagen nicht geöffnet wurden, mit Größe – Deinstallieren oder Cache leeren per Tipp. |
| **Updates** | Absprung zu System-Update und Play Store, Liste der am längsten nicht aktualisierten Apps. OneClean selbst wird über Google Play aktualisiert. |
| **OneClean Pro** | Einmalkauf über Google Play (Produkt-ID `oneclean_pro`): unbegrenzt löschen (kostenlos 10 pro Durchgang) und ungenutzte Apps anzeigen. |
| **Mehrere Geräte** | PC-Tool `tools/oneclean_multi.py` leert per `adb` App-Caches und Junk auf allen verbundenen Geräten. |

Mindestens Android 8.0, Ziel-API 36 (Android 16).

## Veröffentlichung im Play Store

Schritt-für-Schritt-Anleitung, Store-Texte, Grafiken und Datenschutzerklärung: siehe Ordner [`play-store/`](play-store/ANLEITUNG.md).

## Builds

GitHub Actions baut bei jedem Push ein App Bundle (`.aab`, für die Play Console) und eine Test-APK
(`de.onemultimedia.oneclean.debug`, lässt sich neben der Play-Version installieren). Ohne die Secrets
`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` ist das App Bundle unsigniert.

Neue Version:

```bash
git tag v1.0.1
git push origin v1.0.1
```

## Mehrere Geräte

Das Tool **OneClean Multi** (`tools/oneclean_multi.py`) läuft auf dem PC:

1. [Android Platform-Tools](https://developer.android.com/tools/releases/platform-tools) (enthält `adb`) und Python 3 installieren.
2. Auf jedem Gerät *Entwickleroptionen → USB-Debugging* einschalten.
3. Geräte per USB oder WLAN (`python oneclean_multi.py wlan 192.168.x.x:port`) verbinden.
4. `python oneclean_multi.py` starten und im Menü wählen.

## Hinweise zu Android-Grenzen

- Den Cache **anderer** Apps darf eine normale App seit Android 8 nicht direkt löschen. OneClean öffnet dafür die passende Systemseite; das PC-Tool kann es per `adb` für alle Apps auf einmal.
- Andere Apps aktualisieren darf nur der Play Store; OneClean führt dich direkt dorthin.
- Play-Store-Apps erhalten ab Android 11 keinen Zugriff auf den gesamten Speicher. Den Download-Ordner selbst kann man wegen einer Android-Sperre nicht freigeben – nur seine Unterordner; die Downloads-App ist aus OneClean heraus erreichbar.
