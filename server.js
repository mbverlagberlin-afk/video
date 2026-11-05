// KI-Filmstudio – Webserver
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR, publicSettings, saveSettings, getSettings } from './src/config.js';
import { listProjects, getProject, createProject, saveProject, deleteProject, projectDir } from './src/store.js';
import { startJob, getJob, getProjectJob, cancelJob } from './src/jobs.js';
import * as film from './src/pipeline/film.js';
import * as mv from './src/pipeline/musicvideo.js';
import { listVoices } from './src/ai/tts.js';
import { parseScreenplayBasic } from './src/ai/screenplay.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

// Optionaler Passwortschutz (HTTP Basic Auth), wenn APP_PASSWORD gesetzt ist.
if (process.env.APP_PASSWORD) {
  app.use((req, res, next) => {
    const [, b64] = (req.headers.authorization || '').split(' ');
    const pass = b64 ? Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':') : '';
    if (pass === process.env.APP_PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="KI-Filmstudio"').status(401).send('Anmeldung erforderlich');
  });
}

app.use(express.static('public'));
app.use('/media', express.static(PROJECTS_DIR, { maxAge: 0 }));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ error: e.message }));
const upload = multer({ dest: path.join(PROJECTS_DIR, '..', 'uploads'), limits: { fileSize: 500 * 1024 * 1024 } });

// ---------- Einstellungen ----------
app.get('/api/settings', (req, res) => res.json(publicSettings()));
app.put('/api/settings', wrap((req, res) => res.json(saveSettings(req.body))));
app.get('/api/voices', wrap(async (req, res) => res.json(await listVoices())));
app.get('/api/status', (req, res) => {
  const s = getSettings();
  res.json({ claude: s.llmProvider === 'claude' && !!s.anthropicApiKey, replicate: !!s.replicateApiToken, elevenlabs: !!s.elevenlabsApiKey,
    imageProvider: s.imageProvider, videoProvider: s.videoProvider, ttsProvider: s.ttsProvider });
});

// ---------- Projekte ----------
app.get('/api/projects', (req, res) => res.json(listProjects()));
app.post('/api/projects', wrap((req, res) => {
  const { type, title } = req.body;
  if (!['film', 'musikvideo'].includes(type)) throw new Error('Unbekannter Projekttyp');
  res.json(createProject(type, title));
}));
app.get('/api/projects/:id', wrap((req, res) => res.json({ ...getProject(req.params.id), job: getProjectJob(req.params.id) })));
app.put('/api/projects/:id', wrap((req, res) => {
  const p = getProject(req.params.id);
  const editable = p.type === 'film'
    ? ['title', 'screenplay', 'style', 'analysis', 'subtitles', 'musicVolume']
    : ['title', 'theme', 'lyrics', 'style', 'keyframes', 'mode', 'reactive'];
  const body = { ...req.body };
  // Generierte Medien (Bilder/Clips/Ton) werden nur vom Server gesetzt – so überschreibt
  // ein Speichern aus dem Browser während eines laufenden Auftrags keine neuen Ergebnisse.
  if (body.analysis && p.analysis && p.type === 'film') mergeShotMedia(body.analysis, p.analysis);
  if (body.keyframes && p.type === 'musikvideo') mergeKeyframeMedia(body.keyframes, p.keyframes || []);
  for (const k of editable) if (k in body) p[k] = body[k];
  res.json(saveProject(p));
}));
function mergeShotMedia(incoming, current) {
  const old = new Map(current.scenes.flatMap((sc) => sc.shots).map((sh) => [sh.id, sh]));
  for (const sh of (incoming.scenes || []).flatMap((sc) => sc.shots || [])) {
    const o = old.get(sh.id);
    sh.image = o?.image ?? null; sh.clip = o?.clip ?? null;
    const dialogueSame = JSON.stringify(o?.dialogue || []) === JSON.stringify(sh.dialogue || []);
    const voicesSame = JSON.stringify(current.characters.map((c) => c.voiceId)) === JSON.stringify((incoming.characters || []).map((c) => c.voiceId));
    if (o && dialogueSame && voicesSame) { sh.audio = o.audio ?? null; sh.lines = o.lines; sh.audioDuration = o.audioDuration; }
    else { sh.audio = null; delete sh.lines; delete sh.audioDuration; }
  }
}
function mergeKeyframeMedia(incoming, current) {
  const old = new Map(current.map((k) => [k.id, k]));
  for (const k of incoming) { const o = old.get(k.id); k.image = o?.image ?? null; k.clip = o?.clip ?? null; }
}

app.delete('/api/projects/:id', wrap((req, res) => { deleteProject(req.params.id); res.json({ ok: true }); }));

// Datei-Uploads: Audio (Musikvideo), Hintergrundmusik (Film), Drehbuch-Textdatei
app.post('/api/projects/:id/upload/:kind', upload.single('file'), wrap(async (req, res) => {
  const p = getProject(req.params.id);
  if (!req.file) throw new Error('Keine Datei erhalten');
  const ext = path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
  if (req.params.kind === 'screenplay') {
    p.screenplay = fs.readFileSync(req.file.path, 'utf8'); fs.rmSync(req.file.path);
    return res.json(saveProject(p));
  }
  if (!['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus'].includes(ext)) { fs.rmSync(req.file.path); throw new Error('Bitte eine Audiodatei (mp3, wav, m4a, ogg, flac) hochladen'); }
  const name = (req.params.kind === 'music' ? 'hintergrundmusik' : 'audio') + ext;
  fs.renameSync(req.file.path, path.join(projectDir(p.id), name));
  if (req.params.kind === 'music') p.musicFile = name;
  else { p.audioFile = name; p.audioName = req.file.originalname; p.analysis = null; }
  res.json(saveProject(p));
}));

// ---------- Aufträge ----------
const ACTIONS = {
  film: { analyze: film.analyze, images: film.images, clips: film.clips, dialogue: film.dialogue, render: film.render, all: film.all },
  musikvideo: { analyze: mv.analyze, keyframes: mv.autoKeyframes, images: mv.images, render: mv.render },
};
app.post('/api/projects/:id/run/:action', wrap((req, res) => {
  const p = getProject(req.params.id);
  const fn = ACTIONS[p.type]?.[req.params.action];
  if (!fn) throw new Error('Unbekannte Aktion');
  const job = startJob(p.id, req.params.action, (ctx) => fn(p.id, ctx, req.body || {}));
  res.json(job);
}));
app.get('/api/jobs/:id', (req, res) => { const j = getJob(req.params.id); j ? res.json(j) : res.status(404).json({ error: 'Nicht gefunden' }); });
app.post('/api/jobs/:id/cancel', (req, res) => res.json(cancelJob(req.params.id) || {}));

// Schnellvorschau des regelbasierten Parsers (ohne KI)
app.post('/api/parse-preview', wrap((req, res) => res.json(parseScreenplayBasic(req.body.text || ''))));

app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden' }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`KI-Filmstudio läuft auf http://localhost:${PORT}`));
