export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
  const res = await fetch('/api' + path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export function toast(msg, err = false) {
  const el = document.createElement('div');
  el.textContent = msg; if (err) el.className = 'err';
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), err ? 7000 : 3000);
}

export function debounce(fn, ms = 600) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const fmtTime = (t) => { t = Math.max(0, t || 0); return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`; };

/** Startet einen Auftrag und zeigt den Fortschritt unten rechts an. onDone wird nach Abschluss aufgerufen. */
let jobTimer = null;
export async function runJob(projectId, action, body, onDone, onTick) {
  try {
    const job = await api(`/projects/${projectId}/run/${action}`, { method: 'POST', body: body || {} });
    watchJob(job.id, onDone, onTick);
  } catch (e) { toast(e.message, true); }
}

export function watchJob(jobId, onDone, onTick) {
  clearInterval(jobTimer);
  let panel = document.getElementById('jobpanel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'jobpanel'; panel.className = 'job'; document.body.appendChild(panel); }
  const draw = (j) => {
    panel.innerHTML = `<div class="row"><b class="grow">${esc(j.step)}</b><span class="muted small">${Math.round(j.progress * 100)} %</span>
      ${j.state === 'läuft' ? '<button class="sm danger" id="jobcancel">Abbrechen</button>' : '<button class="sm" id="jobclose">Schließen</button>'}</div>
      <div class="bar"><div style="width:${j.progress * 100}%"></div></div>
      ${j.error ? `<div class="small" style="color:var(--err)">${esc(j.error)}</div>` : ''}
      <div class="log" id="joblog">${esc(j.log.slice(-40).join('\n'))}</div>`;
    const lg = document.getElementById('joblog'); lg.scrollTop = lg.scrollHeight;
    document.getElementById('jobcancel')?.addEventListener('click', () => api(`/jobs/${j.id}/cancel`, { method: 'POST' }));
    document.getElementById('jobclose')?.addEventListener('click', () => panel.remove());
  };
  let lastStep = '';
  const tick = async () => {
    try {
      const j = await api('/jobs/' + jobId);
      draw(j);
      if (j.step !== lastStep) { lastStep = j.step; onTick?.(j); }
      if (j.state !== 'läuft') {
        clearInterval(jobTimer);
        if (j.state === 'fertig') { toast('Fertig ✓'); setTimeout(() => panel.remove(), 4000); } else toast(j.error || 'Fehler', true);
        onDone?.(j);
      }
    } catch { clearInterval(jobTimer); }
  };
  tick(); jobTimer = setInterval(tick, 1200);
}
