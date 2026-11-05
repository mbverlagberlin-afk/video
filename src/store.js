// Einfache dateibasierte Projektablage: data/projects/<id>/project.json + Medien.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PROJECTS_DIR } from './config.js';

export const projectDir = (id) => {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Ungültige Projekt-ID');
  return path.join(PROJECTS_DIR, id);
};
const projectFile = (id) => path.join(projectDir(id), 'project.json');

export function listProjects(ownerId = null) {
  return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => { try { return getProject(d.name); } catch { return null; } })
    .filter((p) => p && (!ownerId || p.ownerId === ownerId))
    .map(({ id, type, title, createdAt, updatedAt, output, status, ownerId: o }) => ({ id, type, title, createdAt, updatedAt, output, status, ownerId: o }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function getProject(id) {
  return JSON.parse(fs.readFileSync(projectFile(id), 'utf8'));
}

export function createProject(type, title, ownerId = null) {
  const id = crypto.randomUUID().slice(0, 8) + '-' + Date.now().toString(36);
  const now = new Date().toISOString();
  const base = { id, ownerId, type, title: title || (type === 'film' ? 'Neuer Film' : 'Neues Musikvideo'), createdAt: now, updatedAt: now, status: 'entwurf', output: null };
  const project = type === 'film'
    ? { ...base, screenplay: '', style: 'filmisch, 35mm, natürliches Licht, hohe Detailtiefe', analysis: null, subtitles: true, musicFile: null, musicVolume: 0.25 }
    : { ...base, audioFile: null, analysis: null, theme: '', lyrics: '', style: 'surreal, leuchtende Farben, traumartig, hochdetailliert', keyframes: [], mode: 'reaktiv',
        reactive: { zoomDrift: 0.15, bassZoom: 0.12, rotation: 1.5, beatFlash: 0.25, crossfade: 0.6, shake: 0.0 } };
  fs.mkdirSync(projectDir(id), { recursive: true });
  saveProject(project);
  return project;
}

export function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  const file = projectFile(project.id);
  fs.writeFileSync(file + '.tmp', JSON.stringify(project, null, 2));
  fs.renameSync(file + '.tmp', file);
  return project;
}

export function updateProject(id, fn) {
  const p = getProject(id);
  const r = fn(p) || p;
  return saveProject(r);
}

export function deleteProject(id) {
  fs.rmSync(projectDir(id), { recursive: true, force: true });
}

export const mediaUrl = (id, rel) => `/media/${id}/${rel}`;
