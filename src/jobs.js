// Hintergrund-Jobs mit Fortschritt und Log (im Speicher; je Projekt nur ein Job gleichzeitig).
import crypto from 'node:crypto';

const jobs = new Map();
const activeByProject = new Map();

export function startJob(projectId, kind, fn) {
  if (activeByProject.has(projectId)) {
    const running = jobs.get(activeByProject.get(projectId));
    if (running && running.state === 'läuft') throw new Error('Für dieses Projekt läuft bereits ein Auftrag.');
  }
  const job = { id: crypto.randomUUID(), projectId, kind, state: 'läuft', progress: 0, step: 'Start', log: [], error: null, startedAt: Date.now(), cancelled: false };
  jobs.set(job.id, job);
  activeByProject.set(projectId, job.id);
  const ctx = {
    progress(p, step) { job.progress = Math.max(0, Math.min(1, p)); if (step) { job.step = step; ctx.log(step); } },
    log(msg) { job.log.push(`[${new Date().toLocaleTimeString('de-DE')}] ${msg}`); if (job.log.length > 300) job.log.shift(); },
    checkCancel() { if (job.cancelled) throw new Error('Abgebrochen'); },
  };
  Promise.resolve()
    .then(() => fn(ctx))
    .then(() => { job.state = 'fertig'; job.progress = 1; job.step = 'Fertig'; ctx.log('Fertig.'); })
    .catch((e) => { job.state = 'fehler'; job.error = e.message || String(e); ctx.log('FEHLER: ' + job.error); console.error(e); })
    .finally(() => { job.finishedAt = Date.now(); });
  return job;
}

export const getJob = (id) => jobs.get(id);
export function getProjectJob(projectId) {
  const id = activeByProject.get(projectId);
  return id ? jobs.get(id) : null;
}
export function cancelJob(id) {
  const j = jobs.get(id);
  if (j) j.cancelled = true;
  return j;
}
