import { $, esc, api, toast } from './util.js';
import { renderFilm } from './film.js';
import { renderMusicVideo } from './musicvideo.js';

const app = $('#app');
let cleanup = null;
let me = null;

async function route() {
  cleanup?.(); cleanup = null;
  if (!me) return showAuth();
  const [, view, id] = location.hash.replace(/^#/, '').split('/');
  try {
    if (view === 'film' && id) cleanup = await renderFilm(app, id);
    else if (view === 'mv' && id) cleanup = await renderMusicVideo(app, id);
    else if (view === 'einstellungen' && me.role === 'admin') await renderSettings();
    else if (view === 'konto') await renderAccount();
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
    </form>
    <div class="panel" id="usersbox" style="margin-top:18px"></div>`;
  renderUsers($('#usersbox'));
  $('#settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try { await api('/settings', { method: 'PUT', body }); toast('Gespeichert'); refreshStatus(); renderSettings(); } catch (err) { toast(err.message, true); }
  });
}

// ---------- Anmeldung ----------
function setUser(u) {
  me = u;
  $('#nav').hidden = !u; $('#userbox').hidden = !u; $('#status-pills').hidden = !u;
  $('#nav-settings').hidden = u?.role !== 'admin';
  if (u) $('#username').textContent = u.name + (u.role === 'admin' ? ' (Admin)' : '');
}

async function showAuth() {
  const { user, setupNeeded } = await api('/auth/me');
  if (user) { setUser(user); return route(); }
  setUser(null);
  app.innerHTML = `
    <div class="panel auth-box">
      <h1>${setupNeeded ? 'Willkommen!' : 'Anmelden'}</h1>
      <p class="muted small" style="text-align:center">${setupNeeded ? 'Lege jetzt dein Administrator-Konto an. Damit verwaltest du später alle Benutzer und Einstellungen.' : 'Bitte melde dich an, um das KI-Filmstudio zu nutzen.'}</p>
      <form id="authform">
        ${setupNeeded ? '<label>Dein Name</label><input name="name" required autocomplete="name">' : ''}
        <label>E-Mail</label><input name="email" type="email" required autocomplete="email">
        <label>Passwort${setupNeeded ? ' (mindestens 8 Zeichen)' : ''}</label><input name="password" type="password" required minlength="${setupNeeded ? 8 : 1}" autocomplete="${setupNeeded ? 'new-password' : 'current-password'}">
        ${setupNeeded ? '<label>Passwort wiederholen</label><input name="password2" type="password" required autocomplete="new-password">' : ''}
        <button class="primary" type="submit">${setupNeeded ? 'Konto anlegen' : 'Anmelden'}</button>
      </form>
    </div>`;
  $('#authform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if (setupNeeded && body.password !== body.password2) return toast('Die Passwörter stimmen nicht überein.', true);
    try {
      const r = await api(setupNeeded ? '/auth/setup' : '/auth/login', { method: 'POST', body });
      setUser(r.user); route();
    } catch (err) { toast(err.message, true); }
  });
}

$('#logout').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); location.hash = '#/'; showAuth(); });
window.addEventListener('abgemeldet', () => { if (me) { setUser(null); toast('Bitte erneut anmelden.', true); showAuth(); } });

async function renderAccount() {
  app.innerHTML = `
    <h1>Mein Konto</h1>
    <div class="panel" style="max-width:480px">
      <p><b>${esc(me.name)}</b><br><span class="muted">${esc(me.email)}</span></p>
      <h2>Passwort ändern</h2>
      <form id="pwform">
        <label>Aktuelles Passwort</label><input name="current" type="password" required autocomplete="current-password">
        <label>Neues Passwort (mindestens 8 Zeichen)</label><input name="password" type="password" minlength="8" required autocomplete="new-password">
        <button class="primary" type="submit" style="margin-top:14px">Passwort speichern</button>
      </form>
    </div>`;
  $('#pwform').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/auth/password', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Passwort geändert'); e.target.reset(); } catch (err) { toast(err.message, true); }
  });
}

async function renderUsers(box) {
  const users = await api('/users');
  box.innerHTML = `
    <h2>Benutzer</h2>
    <p class="small muted">Nur angemeldete Benutzer können das Studio nutzen. Jeder sieht nur seine eigenen Projekte; Administratoren sehen alle.</p>
    <table class="users"><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th></th></tr>
    ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? 'Admin' : 'Benutzer'}</td>
      <td style="text-align:right"><button class="sm" data-pw="${u.id}">Passwort</button> ${u.id !== me.id ? `<button class="sm danger" data-udel="${u.id}">Löschen</button>` : ''}</td></tr>`).join('')}</table>
    <h3 style="margin-top:18px">Neuen Benutzer anlegen</h3>
    <form id="newuser" class="row">
      <input name="name" placeholder="Name" style="flex:1;min-width:120px">
      <input name="email" type="email" placeholder="E-Mail" required style="flex:1;min-width:160px">
      <input name="password" type="text" placeholder="Startpasswort (8+ Zeichen)" minlength="8" required style="flex:1;min-width:160px">
      <select name="role" style="width:auto"><option value="user">Benutzer</option><option value="admin">Admin</option></select>
      <button type="submit">Anlegen</button>
    </form>`;
  $('#newuser', box).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Benutzer angelegt'); renderUsers(box); } catch (err) { toast(err.message, true); }
  });
  box.querySelectorAll('[data-udel]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Benutzer löschen? Seine Projekte bleiben erhalten und sind für Admins sichtbar.')) return;
    try { await api('/users/' + b.dataset.udel, { method: 'DELETE' }); renderUsers(box); } catch (err) { toast(err.message, true); }
  }));
  box.querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', async () => {
    const pw = prompt('Neues Passwort (mindestens 8 Zeichen):'); if (!pw) return;
    try { await api(`/users/${b.dataset.pw}/password`, { method: 'PUT', body: { password: pw } }); toast('Passwort gesetzt'); } catch (err) { toast(err.message, true); }
  }));
}

window.addEventListener('hashchange', route);
showAuth();
