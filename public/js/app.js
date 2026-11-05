import { $, esc, api, toast } from './util.js';
import { renderFilm } from './film.js';
import { renderMusicVideo } from './musicvideo.js';

const app = $('#app');
let cleanup = null;

async function route() {
  cleanup?.(); cleanup = null;
  const [, view, id] = location.hash.replace(/^#/, '').split('/');
  try {
    if (view === 'film' && id) cleanup = await renderFilm(app, id);
    else if (view === 'mv' && id) cleanup = await renderMusicVideo(app, id);
    else if (view === 'einstellungen') await renderSettings();
    else await renderDashboard();
  } catch (e) { app.innerHTML = `<div class="panel">Fehler: ${esc(e.message)}</div>`; }
  refreshStatus();
}

export async function refreshStatus() {
  try {
    const s = await api('/status');
    const pill = (on, label) => `<span class="pill ${on ? 'on' : ''}">${label}</span>`;
    $('#status-pills').innerHTML =
      pill(s.claude, s.claude ? 'Claude aktiv' : 'Claude: aus') +
      pill(s.imageProvider !== 'demo', 'Bild: ' + s.imageProvider) +
      pill(s.videoProvider !== 'demo', 'Video: ' + s.videoProvider) +
      pill(s.ttsProvider !== 'demo', 'Stimme: ' + s.ttsProvider);
  } catch {}
}

async function renderDashboard() {
  const projects = await api('/projects');
  app.innerHTML = `
    <h1>Willkommen im KI-Filmstudio</h1>
    <p class="muted">Verwandle Drehbücher in Filme – oder Songs in audio-reaktive Musikvideos.</p>
    <div class="new-cards">
      <div class="new-card" data-new="film"><div class="type-icon">🎬</div><h2>Film aus Drehbuch</h2>
        <p class="muted small">Drehbuch einfügen → KI zerlegt es in Szenen &amp; Einstellungen → Bilder, Videoclips und Stimmen werden generiert → fertiger Film mit Untertiteln.</p></div>
      <div class="new-card" data-new="musikvideo"><div class="type-icon">🎵</div><h2>Musikvideo</h2>
        <p class="muted small">Song hochladen → Beat- &amp; Tempoerkennung → Prompt-Keyframes auf der Timeline → Bilder bewegen sich im Takt (Zoom, Drehung, Blitze) oder KI-Videoclips mit Schnitt auf den Beat.</p></div>
    </div>
    <h2>Deine Projekte</h2>
    ${projects.length ? `<div class="grid">${projects.map((p) => `
      <div class="card project" data-open="${p.type === 'film' ? 'film' : 'mv'}/${p.id}">
        <div class="media">${p.output ? `<video src="${esc(p.output)}" muted preload="metadata"></video>` : `<span class="type-icon">${p.type === 'film' ? '🎬' : '🎵'}</span>`}</div>
        <div class="body"><div class="row"><b class="grow">${esc(p.title)}</b><span class="badge ${p.status === 'fertig' ? 'ok' : ''}">${esc(p.status)}</span></div>
        <div class="row small muted"><span class="grow">${p.type === 'film' ? 'Film' : 'Musikvideo'} · ${new Date(p.updatedAt).toLocaleString('de-DE')}</span>
        <button class="sm danger" data-del="${p.id}" title="Löschen">🗑</button></div></div>
      </div>`).join('')}</div>` : '<div class="empty panel">Noch keine Projekte. Lege oben dein erstes an.</div>'}`;
  app.querySelectorAll('[data-new]').forEach((el) => el.addEventListener('click', async () => {
    const p = await api('/projects', { method: 'POST', body: { type: el.dataset.new } });
    location.hash = `#/${p.type === 'film' ? 'film' : 'mv'}/${p.id}`;
  }));
  app.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => { location.hash = '#/' + el.dataset.open; }));
  app.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Projekt mit allen Dateien löschen?')) return;
    await api('/projects/' + el.dataset.del, { method: 'DELETE' }); renderDashboard();
  }));
}

async function renderSettings() {
  const s = await api('/settings');
  const sel = (name, opts) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${s[name] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const inp = (name, ph = '', type = 'text') => `<input name="${name}" type="${type}" value="${esc(s[name])}" placeholder="${esc(ph)}">`;
  app.innerHTML = `
    <h1>Einstellungen</h1>
    <form id="settings">
      <div class="two">
        <div>
          <div class="panel"><h2>KI-Anbieter</h2>
            <div class="hint">Im <b>Demo-Modus</b> läuft alles offline mit Platzhalterbildern, Kamerafahrten und Computerstimme – ideal zum Ausprobieren des Ablaufs. Für echte KI-Ergebnisse trage unten die API-Schlüssel ein und wähle die Anbieter.</div>
            <label>Drehbuch-Analyse &amp; Prompts</label>${sel('llmProvider', [['claude', 'Claude (Anthropic)'], ['demo', 'Regelbasiert (offline)']])}
            <label>Bildgenerierung</label>${sel('imageProvider', [['replicate', 'Replicate (FLUX u. a.)'], ['demo', 'Demo (Platzhalter)']])}
            <label>Bild-zu-Video</label>${sel('videoProvider', [['replicate', 'Replicate (Kling, Wan, Hailuo, Seedance …)'], ['demo', 'Demo (Kamerafahrt)']])}
            <label>Stimmen / Sprachausgabe</label>${sel('ttsProvider', [['elevenlabs', 'ElevenLabs'], ['demo', 'Demo (Computerstimme)']])}
          </div>
          <div class="panel"><h2>Ausgabeformat</h2>
            <div class="row"><div class="grow"><label>Breite</label>${inp('width', '', 'number')}</div><div class="grow"><label>Höhe</label>${inp('height', '', 'number')}</div><div class="grow"><label>Bilder/s</label>${inp('fps', '', 'number')}</div></div>
            <p class="small muted">1280×720 (16:9) · 1080×1920 (Hochformat für Reels/TikTok) · 1080×1080 (quadratisch)</p>
          </div>
        </div>
        <div>
          <div class="panel"><h2>API-Schlüssel</h2>
            <label>Anthropic API-Key (<a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>)</label>${inp('anthropicApiKey', 'sk-ant-…', 'password')}
            <label>Replicate API-Token (<a href="https://replicate.com/account/api-tokens" target="_blank">replicate.com</a>)</label>${inp('replicateApiToken', 'r8_…', 'password')}
            <label>ElevenLabs API-Key (<a href="https://elevenlabs.io" target="_blank">elevenlabs.io</a>)</label>${inp('elevenlabsApiKey', '', 'password')}
            <p class="small muted">Schlüssel werden nur lokal auf dem Server in <code>data/settings.json</code> gespeichert.</p>
          </div>
          <div class="panel"><h2>Modelle</h2>
            <label>Claude-Modell</label>${inp('claudeModel')}
            <label>Bildmodell (Replicate)</label>${inp('imageModel', 'black-forest-labs/flux-1.1-pro')}
            <p class="small muted">z. B. black-forest-labs/flux-1.1-pro, black-forest-labs/flux-schnell (günstig), black-forest-labs/flux-1.1-pro-ultra</p>
            <label>Videomodell (Replicate)</label>${inp('videoModel', 'kwaivgi/kling-v2.1')}
            <p class="small muted">z. B. kwaivgi/kling-v2.1, kwaivgi/kling-v2.5-turbo-pro, wan-video/wan-2.2-i2v-fast, minimax/hailuo-02, bytedance/seedance-1-pro</p>
            <label>Name des Bild-Eingabefelds (nur für andere Modelle nötig)</label>${inp('videoImageKey', 'automatisch')}
            <label>ElevenLabs-Modell</label>${inp('elevenlabsModel')}
          </div>
        </div>
      </div>
      <button class="primary" type="submit">Speichern</button>
    </form>`;
  $('#settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try { await api('/settings', { method: 'PUT', body }); toast('Gespeichert'); refreshStatus(); renderSettings(); } catch (err) { toast(err.message, true); }
  });
}

window.addEventListener('hashchange', route);
route();
