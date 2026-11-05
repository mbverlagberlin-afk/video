// Drehbuch-Analyse: zerlegt ein Drehbuch in Figuren, Szenen und Einstellungen (Shots).
import { claudeAvailable, claudeJSON } from './claude.js';

const str = { type: 'string' };
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'logline', 'visualStyle', 'characters', 'scenes'],
  properties: {
    title: str, logline: str, visualStyle: str,
    characters: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'appearance', 'voice'],
      properties: { name: str, appearance: str, voice: str } } },
    scenes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heading', 'location', 'timeOfDay', 'summary', 'shots'],
      properties: { heading: str, location: str, timeOfDay: str, summary: str,
        shots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['description', 'camera', 'duration', 'characters', 'dialogue'],
          properties: { description: str, camera: str, duration: { type: 'number' }, characters: { type: 'array', items: str },
            dialogue: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['character', 'line'], properties: { character: str, line: str } } } } } } } } },
  },
};

const SYSTEM = `Du bist ein erfahrener Regisseur, Storyboard-Artist und Kameramann.
Du zerlegst Drehbücher in eine Shotliste, die direkt an KI-Bild- und Videogeneratoren gegeben wird.
Regeln:
- "appearance" jeder Figur ist eine feste, sehr konkrete visuelle Beschreibung (Alter, Gesicht, Haare, Kleidung, Statur), damit die Figur in jedem Bild gleich aussieht. Auf Englisch.
- "voice" beschreibt die Stimme kurz (z. B. "tiefe, ruhige Männerstimme").
- "description" jedes Shots ist ein eigenständiger, bildhafter Prompt auf Englisch: Motiv, Handlung, Umgebung, Licht, Stimmung. Keine Figurennamen allein – beschreibe, wer zu sehen ist.
- "camera": Einstellungsgröße und Bewegung (z. B. "wide shot, slow dolly in").
- "duration" in Sekunden (2–10), passend zu Handlung und Dialoglänge.
- "dialogue" übernimmt die Dialogzeilen wörtlich in der Originalsprache des Drehbuchs.
- "visualStyle": ein englischer Stil-Prompt für den gesamten Film.`;

export async function analyzeScreenplay(screenplay, style, log = () => {}) {
  if (!screenplay?.trim()) throw new Error('Das Drehbuch ist leer.');
  let result;
  if (claudeAvailable()) {
    log('Analysiere Drehbuch mit Claude …');
    result = await claudeJSON({ system: SYSTEM, schema: SCHEMA, effort: 'high',
      prompt: `Gewünschter Stil: ${style || 'frei wählbar'}\n\nDrehbuch:\n<drehbuch>\n${screenplay}\n</drehbuch>` });
  } else {
    log('Kein Claude-API-Schlüssel – nutze den eingebauten regelbasierten Parser.');
    result = parseScreenplayBasic(screenplay);
  }
  return normalize(result);
}

function normalize(r) {
  let n = 0;
  r.characters = (r.characters || []).map((c, i) => ({ ...c, id: 'c' + i, voiceId: '' }));
  r.scenes = (r.scenes || []).map((sc, si) => ({ ...sc, id: 's' + si, shots: (sc.shots || []).map((sh) => ({
    ...sh, id: `sh${n++}`, duration: Math.max(2, Math.min(10, Number(sh.duration) || 4)), image: null, clip: null, audio: null, status: 'offen' })) }));
  return r;
}

// ---------- Fallback: regelbasierter Parser (Fountain-/Standardformat, Deutsch & Englisch) ----------
const HEADING = /^(INT\.?|EXT\.?|INT\.?\/EXT\.?|I\/E|INNEN|AUSSEN|AUßEN|EST\.?)[\s.\-–]/i;
const TRANSITION = /^(CUT TO:|FADE (IN|OUT)[:.]?|DISSOLVE TO:|SCHNITT( ZU)?:?|ABBLENDE|AUFBLENDE)/i;

export function parseScreenplayBasic(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const scenes = []; const chars = new Map();
  let scene = null; let title = '';
  const ensureScene = () => { if (!scene) { scene = { heading: 'SZENE 1', location: 'unbekannt', timeOfDay: '', summary: '', shots: [], _action: [] }; scenes.push(scene); } return scene; };
  const flushAction = () => {
    if (!scene || !scene._action.length) return;
    const desc = scene._action.join(' ').trim();
    if (desc) scene.shots.push({ description: `${desc}. Setting: ${scene.location}, ${scene.timeOfDay}`, camera: scene.shots.length ? 'medium shot' : 'wide establishing shot', duration: Math.min(8, 3 + desc.length / 60), characters: [], dialogue: [] });
    scene._action = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]; const line = raw.trim();
    if (!line) continue;
    if (/^title:/i.test(line)) { title = line.split(':').slice(1).join(':').trim(); continue; }
    if (HEADING.test(line) || /^\.[A-ZÄÖÜ]/.test(line)) {
      flushAction();
      const h = line.replace(/^\./, '');
      const parts = h.replace(HEADING, '').split(/\s[-–]\s/).map((x) => x.trim()).filter(Boolean);
      const timeOfDay = parts.length > 1 ? parts.pop() : '';
      scene = { heading: h, location: parts.join(', ') || h, timeOfDay, summary: '', shots: [], _action: [] };
      scenes.push(scene); continue;
    }
    if (TRANSITION.test(line)) { flushAction(); continue; }
    const next = (lines[i + 1] || '').trim();
    const isCue = (/^[A-ZÄÖÜ0-9 .'\-]+(\s*\(.*\))?$/.test(line) && line.length < 40 && /[A-ZÄÖÜ]/.test(line) && next) || /^@/.test(line);
    if (isCue) {
      flushAction(); ensureScene();
      const name = line.replace(/^@/, '').replace(/\(.*\)/, '').trim();
      const key = name.toUpperCase();
      if (!chars.has(key)) chars.set(key, { name: name, appearance: `a person called ${name}, distinctive look`, voice: 'neutrale Stimme' });
      const dl = [];
      while (i + 1 < lines.length && lines[i + 1].trim()) {
        i++; const l = lines[i].trim();
        if (/^\(.*\)$/.test(l)) continue; // Regieanweisung
        dl.push(l);
      }
      const lineText = dl.join(' ');
      const last = scene.shots[scene.shots.length - 1];
      const shot = { description: `${name} speaking, ${scene.location}, ${scene.timeOfDay}`, camera: 'medium close-up', duration: Math.min(10, Math.max(3, lineText.length / 14)), characters: [name], dialogue: [{ character: name, line: lineText }] };
      if (last && last.dialogue.length && last.characters.includes(name) && last.duration + shot.duration <= 10) { last.dialogue.push(shot.dialogue[0]); last.duration += shot.duration; }
      else scene.shots.push(shot);
      continue;
    }
    ensureScene()._action.push(line);
  }
  flushAction();
  for (const sc of scenes) { sc.summary = sc.shots.map((s) => s.description).join(' ').slice(0, 200); delete sc._action; if (!sc.shots.length) sc.shots.push({ description: sc.heading, camera: 'wide shot', duration: 3, characters: [], dialogue: [] }); }
  return { title: title || 'Ohne Titel', logline: '', visualStyle: '', characters: [...chars.values()], scenes };
}
