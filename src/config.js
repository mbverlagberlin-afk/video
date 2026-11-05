// Zentrale Einstellungen: data/settings.json, überschreibbar per Umgebungsvariablen.
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

export const DEFAULTS = {
  // Anbieter: "demo" funktioniert komplett offline (Platzhalter), sonst echte KI-Dienste.
  llmProvider: 'claude', // claude | demo
  imageProvider: 'demo', // replicate | demo
  videoProvider: 'demo', // replicate | demo
  ttsProvider: 'demo', // elevenlabs | demo
  anthropicApiKey: '',
  replicateApiToken: '',
  elevenlabsApiKey: '',
  claudeModel: 'claude-opus-5-5',
  imageModel: 'black-forest-labs/flux-1.1-pro',
  videoModel: 'kwaivgi/kling-v2.1',
  videoImageKey: '', // leer = automatisch je nach Modell
  elevenlabsModel: 'eleven_multilingual_v2',
  width: 1280,
  height: 720,
  fps: 24,
};

const ENV_MAP = {
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  replicateApiToken: 'REPLICATE_API_TOKEN',
  elevenlabsApiKey: 'ELEVENLABS_API_KEY',
};
const SECRET_KEYS = Object.keys(ENV_MAP);

function readFile() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}

export function getSettings() {
  const s = { ...DEFAULTS, ...readFile() };
  for (const [k, env] of Object.entries(ENV_MAP)) if (!s[k] && process.env[env]) s[k] = process.env[env];
  s.width = Number(s.width) || DEFAULTS.width;
  s.height = Number(s.height) || DEFAULTS.height;
  s.fps = Number(s.fps) || DEFAULTS.fps;
  return s;
}

export function publicSettings() {
  const s = getSettings();
  const out = { ...s };
  for (const k of SECRET_KEYS) out[k] = s[k] ? '••••' + String(s[k]).slice(-4) : '';
  return out;
}

export function saveSettings(patch) {
  const current = readFile();
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULTS)) continue;
    if (SECRET_KEYS.includes(k) && typeof v === 'string' && v.startsWith('••••')) continue; // unverändert
    current[k] = v;
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2));
  return publicSettings();
}
