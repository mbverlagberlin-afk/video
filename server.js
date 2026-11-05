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
import * as auth from './src/auth.js';

const app = express();
app.set('trust proxy', 1); // hinter Render/Reverse-Proxy: echte IP und HTTPS erkennen
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' }); next(); });
auth.seedAdminFromEnv();

const wrap = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).catch((e) => res.status(e.status || 400).json({ error: e.message }));

// ---------- Anmeldung (ohne Login erreichbar) ----------
app.get('/api/auth/me', (req, res) => res.json({ user: auth.currentUser(req), setupNeeded: !auth.hasUsers() }));
app.post('/api/auth/login', wrap((req, res) => res.json({ user: auth.login(req, res, req.body.email, req.body.password) })));
app.post('/api/auth/logout', (req, res) => { auth.logout(req, res); res.json({ ok: true }); });
// Ersteinrichtung: Nur solange noch kein Konto existiert, wird das erste Konto als Administrator angelegt.
app.post('/api/auth/setup', wrap((req, res) => {
  if (auth.hasUsers()) throw new Error('Die Einrichtung ist bereits abgeschlossen.');
  auth.createUser({ email: req.body.email, password: req.body.password, name: req.body.name, role: 'admin' });
  res.json({ user: auth.login(req, res, req.body.email, req.body.password) });
}));

app.use(express.static('public'));

// Ab hier ist alles nur für angemeldete Benutzer.
app.use('/api', auth.requireUser);
const canAccess = (user, projectId) => { try { const p = getProject(projectId); return user.role === 'admin' || p.ownerId === user.id; } catch { return false; } };
app.use('/media/:id', auth.requireUser, (req, res, next) => (canAccess(req.user, req.params.id) ? next() : res.status(404).end()));
app.use('/media', express.static(PROJECTS_DIR, { maxAge: 0 }));
app.use('/api/projects/:id', (req, res, next) => (canAccess(req.user, req.params.id) ? next() : res.status(404).json({ error: 'Projekt nicht gefunden' })));

// ---------- Konto & Benutzerverwaltung ----------
app.put('/api/auth/password', wrap((req, res) => {
  if (!auth.verifyPassword(req.user.id, String(req.body.current || ''))) throw new Error('Das aktuelle Passwort ist falsch.');
  auth.setPassword(req.user.id, req.body.password);
  auth.login(req, res, req.user.email, req.body.password); // neue Sitzung nach Passwortwechsel
  res.json({ ok: true });
}));
app.get('/api/users', auth.requireAdmin, (req, res) => res.json(auth.listUsers().map(({ id, email, name, role, createdAt }) => ({ id, email, name, role, createdAt }))));
app.post('/api/users', auth.requireAdmin, wrap((req, res) => res.json(auth.createUser(req.body))));
app.put('/api/users/:uid/password', auth.requireAdmin, wrap((req, res) => { auth.setPassword(req.params.uid, req.body.password); res.json({ ok: true }); }));
app.delete('/api/users/:uid', auth.requireAdmin, wrap((req, res) => { if (req.params.uid === req.user.id) throw new Error('Du kannst dich nicht selbst löschen.'); auth.deleteUser(req.params.uid); res.json({ ok: true }); }));
const upload = multer({ dest: path.join(PROJECTS_DIR, '..', 'uploads'), limits: { fileSize: 500 * 1024 * 1024 } });

// ---------- Einstellungen ----------
app.get('/api/settings', auth.requireAdmin, (req, res) => res.json(publicSettings()));
app.put('/api/settings', auth.requireAdmin, wrap((req, res) => res.json(saveSettings(req.body))));
app.get('/api/voices', wrap(async (req, res) => res.json(await listVoices())));
app.get('/api/status', (req, res) => {
  const s = getSettings();
  res.json({ claude: s.llmProvider === 'claude' && !!s.anthropicApiKey, replicate: !!s.replicateApiToken, elevenlabs: !!s.elevenlabsApiKey,
    imageProvider: s.imageProvider, videoProvider: s.videoProvider, ttsProvider: s.ttsProvider });
});

// ---------- Projekte ----------
app.get('/api/projects', (req, res) => res.json(listProjects(req.user.role === 'admin' ? null : req.user.id)));
app.post('/api/projects', wrap((req, res) => {
  const { type, title } = req.body;
  if (!['film', 'musikvideo'].includes(type)) throw new Error('Unbekannter Projekttyp');
  res.json(createProject(type, title, req.user.id));
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
app.get('/api/jobs/:jid', (req, res) => { const j = getJob(req.params.jid); j && canAccess(req.user, j.projectId) ? res.json(j) : res.status(404).json({ error: 'Nicht gefunden' }); });
app.post('/api/jobs/:jid/cancel', (req, res) => { const j = getJob(req.params.jid); if (!j || !canAccess(req.user, j.projectId)) return res.status(404).json({ error: 'Nicht gefunden' }); res.json(cancelJob(j.id)); });

// Schnellvorschau des regelbasierten Parsers (ohne KI)
app.post('/api/parse-preview', wrap((req, res) => res.json(parseScreenplayBasic(req.body.text || ''))));

app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden' }));
// Fehler nie mit internen Details an den Browser geben
app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ error: err.expose ? err.message : 'Interner Fehler' }); });

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`KI-Filmstudio läuft auf http://localhost:${PORT}`));
