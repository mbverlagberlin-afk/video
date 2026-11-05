# 🎬 KI-Filmstudio

Webbasierte Anwendung, mit der du **aus Drehbüchern KI-Filme** erstellst und **audio-reaktive Musikvideos** machst (ähnlich wie Neural Frames).

## Funktionen

### Film aus Drehbuch
1. **Drehbuch einfügen oder hochladen** (Standard-Drehbuchformat oder [Fountain](https://fountain.io/syntax), Deutsch oder Englisch: `INT.`/`EXT.` bzw. `INNEN`/`AUSSEN`, Figurennamen in GROSSBUCHSTABEN).
2. **KI-Analyse mit Claude:** Das Drehbuch wird in Figuren, Szenen und einzelne Einstellungen (Shots) zerlegt, jeweils mit Bildbeschreibung, Kamera, Dauer und Dialog. Jede Figur bekommt eine feste Optik-Beschreibung, damit sie in allen Bildern gleich aussieht.
3. **Storyboard bearbeiten:** Beschreibungen, Kamera, Dauer und Dialoge anpassen, Einstellungen hinzufügen oder löschen, jeder Figur eine Stimme zuweisen.
4. **Generieren:** Keyframe-Bilder (z. B. FLUX), daraus Videoclips (z. B. Kling, Wan, Hailuo, Seedance) und Sprachausgabe der Dialoge (ElevenLabs). Jede Einstellung lässt sich auch einzeln neu erzeugen.
5. **Film rendern:** Automatischer Schnitt, Dialogton, eingebrannte Untertitel (zusätzlich als SRT-Datei) und optionale Hintergrundmusik, die unter Dialogen automatisch leiser wird. Ergebnis als MP4.

### Musikvideo (ähnlich Neural Frames)
1. **Song hochladen** (MP3, WAV, M4A, OGG, FLAC).
2. **Audioanalyse:** Tempo (BPM), Beats, Abschnitte (ruhig, mittel, intensiv) sowie Hüllkurven für Bass, Höhen und Einsätze (Onsets).
3. **Prompt-Keyframes auf der Timeline:** Mit „Automatisch erstellen“ schreibt Claude passende Bild-Prompts pro Song-Abschnitt (Thema und Songtext werden berücksichtigt). Ein Doppelklick in die Wellenform setzt einen neuen Keyframe, der auf den nächsten Beat einrastet.
4. **Animation**, zwei Modi:
   - **Audio-reaktiv:** Die Bilder zoomen, drehen sich, wackeln und blitzen im Takt (gesteuert von Bass, Höhen und Beats) und blenden weich ineinander über. Mit Reglern und Vorlagen (Ruhig, Groove, Techno, Psychedelisch). Schnell und günstig.
   - **KI-Videoclips:** Für jeden Keyframe wird ein Bild-zu-Video-Clip generiert. Geschnitten wird an den Keyframes.
5. **Live-Vorschau** der Bewegung im Browser, synchron zur Musik.
6. **Rendern** in voller Qualität auf dem Server, mit Originalton.

## Installation

Voraussetzungen: **Node.js 20+** und **ffmpeg** (mit libass und flite, bei den üblichen Linux-Paketen dabei).

```bash
# Ubuntu/Debian
sudo apt install ffmpeg
# macOS
brew install ffmpeg
```

```bash
npm install
```

```bash
npm start
```

Danach im Browser **http://localhost:3000** öffnen.

## KI-Dienste einrichten

Ohne API-Schlüssel läuft die App im **Demo-Modus**: Platzhalterbilder, Kamerafahrten und eine Computerstimme. So kannst du den ganzen Ablauf kostenlos ausprobieren. Für echte KI-Ergebnisse trägst du unter **Einstellungen** die Schlüssel ein und wählst die Anbieter aus:

| Aufgabe | Anbieter | Schlüssel |
|---|---|---|
| Drehbuch-Analyse, Musikvideo-Prompts | Claude (Anthropic) | [console.anthropic.com](https://console.anthropic.com) |
| Bilder | Replicate (z. B. `black-forest-labs/flux-1.1-pro`) | [replicate.com](https://replicate.com/account/api-tokens) |
| Bild-zu-Video | Replicate (z. B. `kwaivgi/kling-v2.1`, `wan-video/wan-2.2-i2v-fast`, `minimax/hailuo-02`, `bytedance/seedance-1-pro`) | wie oben |
| Stimmen | ElevenLabs | [elevenlabs.io](https://elevenlabs.io) |

Die Schlüssel kannst du auch als Umgebungsvariablen setzen: `ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN`, `ELEVENLABS_API_KEY`.

Die Modellnamen lassen sich in den Einstellungen frei ändern. Bei einem Videomodell, das hier nicht vorkonfiguriert ist, trägst du zusätzlich den Namen des Bild-Eingabefelds ein (z. B. `image` oder `start_image`; er steht auf der Modellseite bei Replicate).

> **Kosten:** Videomodelle sind der größte Kostenfaktor, meist einige Cent bis über einen Euro pro Clip. Prüfe deshalb erst Bilder und Storyboard und generiere Clips danach gezielt. Der audio-reaktive Musikvideo-Modus braucht nur ein Bild pro Keyframe.

## Anmeldung & Benutzer

Die App ist nur nach Anmeldung nutzbar. Beim allerersten Aufruf legst du das **Administrator-Konto** an. Mach das direkt nach der Installation, denn bis dahin könnte jeder, der die Adresse kennt, dieses Konto anlegen. Danach gilt:
- Der Administrator legt unter **Einstellungen → Benutzer** weitere Konten an, setzt Passwörter zurück und verwaltet die API-Schlüssel.
- Jeder Benutzer sieht nur seine eigenen Projekte, der Administrator sieht alle.
- Passwörter werden mit scrypt gehasht, Sitzungen laufen über sichere HttpOnly-Cookies (30 Tage). Nach 10 Fehlversuchen innerhalb von 15 Minuten wird die Anmeldung gesperrt.
- Statt der Ersteinrichtung im Browser kannst du das Admin-Konto auch über `ADMIN_EMAIL` und `ADMIN_PASSWORD` anlegen lassen.

## Online stellen (z. B. auf studio.onemultimedia.de)

WordPress.com kann die App nicht selbst ausführen, sie braucht einen eigenen Server mit ffmpeg. Am einfachsten geht es mit **Render.com**, die Vorlage `render.yaml` liegt bei:
1. Bei render.com mit dem GitHub-Konto anmelden und **New → Blueprint** wählen.
2. Dieses Repository und den Branch auswählen. Render baut den Container aus dem `Dockerfile`, inklusive dauerhaftem Speicher (10 GB, Tarif „Starter“).
3. Die angezeigte `…onrender.com`-Adresse öffnen und sofort das Administrator-Konto anlegen.
4. In Render unter **Settings → Custom Domains** die Adresse `studio.onemultimedia.de` eintragen und bei WordPress.com unter Domains → DNS einen **CNAME**-Eintrag `studio` auf die `…onrender.com`-Adresse setzen. HTTPS richtet Render automatisch ein.

## Weitere Optionen

| Variable | Bedeutung |
|---|---|
| `PORT` | Port des Webservers (Standard: 3000) |
| `DATA_DIR` | Ablageort für Projekte und Einstellungen (Standard: `./data`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Legt beim Start ein Admin-Konto an, falls noch keines existiert |

Das Ausgabeformat stellst du unter Einstellungen ein, z. B. 1280×720 (16:9), 1080×1920 (Hochformat für Reels/TikTok) oder 1080×1080.

## Projektstruktur

```
server.js                 Webserver und REST-API
src/config.js             Einstellungen (data/settings.json und Umgebungsvariablen)
src/store.js              Projektablage (data/projects/<id>/)
src/jobs.js               Hintergrundaufträge mit Fortschritt
src/auth.js               Benutzerkonten, Anmeldung, Sitzungen
src/ai/claude.js          Claude-Anbindung (strukturierte JSON-Antworten)
src/ai/screenplay.js      Drehbuch-Analyse (Claude und regelbasierter Offline-Parser)
src/ai/image.js           Bildgenerierung (Replicate / Demo)
src/ai/video.js           Bild-zu-Video (Replicate / Demo-Kamerafahrt)
src/ai/tts.js             Sprachausgabe (ElevenLabs / Demo)
src/audio/analyze.js      Audioanalyse: BPM, Beats, Abschnitte, Hüllkurven
src/render/reactive.js    Audio-reaktiver Bild-für-Bild-Renderer
src/pipeline/film.js      Film-Pipeline
src/pipeline/musicvideo.js Musikvideo-Pipeline
public/                   Weboberfläche (ohne Build-Schritt)
test/                     Tests (npm test)
```
