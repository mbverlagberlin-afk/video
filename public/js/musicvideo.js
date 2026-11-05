import { $, $$, esc, api, toast, debounce, runJob, watchJob, fmtTime } from './util.js';

const PARAMS = [
  ['zoomDrift', 'Zoom-Fahrt', 0, 0.6, 0.01, 'Stetiges Hineinzoomen pro Abschnitt'],
  ['bassZoom', 'Bass-Puls', 0, 0.4, 0.01, 'Zoom-Stoß bei Bass/Kick'],
  ['rotation', 'Drehung (°)', 0, 8, 0.1, 'Schwingende Rotation, verstärkt durch Höhen'],
  ['shake', 'Wackeln', 0, 1, 0.01, 'Kamerawackeln bei Onsets/Snares'],
  ['pan', 'Schwenk', 0, 1, 0.01, 'Langsames seitliches Treiben'],
  ['beatFlash', 'Beat-Blitz', 0, 0.8, 0.01, 'Aufhellen auf jedem Beat'],
  ['crossfade', 'Überblendung (s)', 0, 3, 0.05, 'Weicher Übergang zwischen Keyframes'],
];

const envAt = (env, t, hz) => { if (!env?.length) return 0; const x = t * hz, i = Math.floor(x), f = x - i; const a = env[Math.min(env.length - 1, Math.max(0, i))], b = env[Math.min(env.length - 1, i + 1)] ?? a; return a + (b - a) * f; };

export async function renderMusicVideo(app, id) {
  let p = await api('/projects/' + id);
  let raf = 0; const imgCache = new Map();
  const save = debounce(async (patch) => { try { const np = await api('/projects/' + id, { method: 'PUT', body: patch }); p = { ...p, ...np }; } catch (e) { toast(e.message, true); } }, 600);
  const saveKeys = () => save({ keyframes: p.keyframes });
  const reload = async () => { p = await api('/projects/' + id); draw(); };
  const refreshSoft = async () => { const np = await api('/projects/' + id); p.keyframes.forEach((k) => { const n = np.keyframes.find((x) => x.id === k.id); if (n) { k.image = n.image; k.clip = n.clip; } }); p.analysis = np.analysis; drawKeyframes(); };
  const job = (action, body, full) => runJob(id, action, body, full ? reload : () => { refreshSoft(); if (action === 'render') reload(); }, refreshSoft);
  const sorted = () => [...p.keyframes].sort((a, b) => a.time - b.time);

  function draw() {
    const a = p.analysis;
    app.innerHTML = `
      <div class="row" style="margin-bottom:12px"><a href="#/">← Projekte</a></div>
      <div class="row"><input id="title" class="grow" style="font-size:1.4rem;font-weight:700;background:none;border-color:transparent" value="${esc(p.title)}">
        <button class="primary" id="render">🎬 Musikvideo rendern</button></div>
      <div class="panel">
        <div class="row">
          <label class="btn" style="margin:0;color:var(--text)">🎵 ${p.audioFile ? 'Anderen Song wählen' : 'Song hochladen'}<input type="file" id="audiofile" accept="audio/*" hidden></label>
          ${p.audioFile ? `<span class="muted small grow">${esc(p.audioName || p.audioFile)}</span>` : '<span class="muted grow">MP3, WAV, M4A, OGG oder FLAC</span>'}
          ${a ? `<span class="stat"><b>${a.bpm}</b><span>BPM</span></span><span class="stat"><b>${fmtTime(a.duration)}</b><span>Dauer</span></span><span class="stat"><b>${a.beats.length}</b><span>Beats</span></span>` : ''}
          ${p.audioFile && !a ? '<button class="primary" id="analyze">Audio analysieren</button>' : ''}
        </div>
        ${p.audioFile ? `<audio id="audio" src="/media/${id}/${esc(p.audioFile)}" preload="auto" style="display:none"></audio>` : ''}
        ${a ? `<div class="timeline-wrap" style="margin-top:14px"><canvas class="timeline" id="tl"></canvas></div>
          <div class="row" style="margin-top:8px"><button id="play">▶ Abspielen</button><span id="time" class="muted small">0:00.0</span>
          <span class="grow small muted">Klick = springen · Doppelklick = Keyframe an dieser Stelle (auf Beat eingerastet)</span></div>` : ''}
      </div>
      ${a ? `<div class="two">
        <div>
          <div class="panel"><div class="row"><h2 class="grow">Prompt-Keyframes</h2>
            <button class="sm" id="autokf">✨ Automatisch aus Song erstellen</button><button class="sm" id="addkf">＋ Keyframe</button></div>
            <div id="kfs"></div>
            <div class="row"><button id="genimgs">🖼 Fehlende Bilder generieren</button><button class="sm" id="genall">Alle neu</button></div>
          </div>
        </div>
        <div>
          <div class="panel"><h2>Live-Vorschau</h2><canvas class="preview" id="pv" width="640" height="360"></canvas>
            <p class="small muted">Echtzeit-Vorschau der Bewegung im Browser. Das finale Video wird auf dem Server in voller Qualität gerendert.</p></div>
          <div class="panel"><h2>Konzept</h2>
            <label>Thema / Story</label><textarea id="theme" rows="2" placeholder="z. B. Eine Reise durch einen leuchtenden Unterwasserwald">${esc(p.theme)}</textarea>
            <label>Stil</label><input id="mstyle" value="${esc(p.style)}">
            <label>Songtext (optional, hilft der KI bei passenden Bildern)</label><textarea id="lyrics" rows="3">${esc(p.lyrics)}</textarea>
          </div>
          <div class="panel"><h2>Animation</h2>
            <label>Modus</label>
            <select id="mode"><option value="reaktiv" ${p.mode === 'reaktiv' ? 'selected' : ''}>Audio-reaktiv (Bilder bewegen sich zur Musik – schnell &amp; günstig)</option>
              <option value="ki-clips" ${p.mode === 'ki-clips' ? 'selected' : ''}>KI-Videoclips je Keyframe (Bild-zu-Video, Schnitt auf Keyframes)</option></select>
            <div id="params" style="margin-top:10px">${PARAMS.map(([k, l, min, max, step, hint]) => `
              <div class="slider" title="${esc(hint)}"><span>${l}</span><input type="range" data-p="${k}" min="${min}" max="${max}" step="${step}" value="${p.reactive[k] ?? 0}"><span data-v="${k}">${(+(p.reactive[k] ?? 0)).toFixed(2)}</span></div>`).join('')}
              <div class="row small" style="margin-top:8px">Vorlagen:
                <button class="sm" data-preset="ruhig">Ruhig</button><button class="sm" data-preset="groove">Groove</button><button class="sm" data-preset="techno">Techno</button><button class="sm" data-preset="trip">Psychedelisch</button></div>
            </div>
          </div>
        </div>
      </div>
      <div class="panel" id="outpanel">${p.output ? `<h2>Ergebnis</h2><video class="output" src="${esc(p.output)}" controls></video>
        <div class="row" style="margin-top:10px"><a class="btn" href="${esc(p.output.split('?')[0])}" download>⬇ Herunterladen (MP4)</a></div>` : '<div class="muted">Noch nicht gerendert.</div>'}</div>` : ''}`;
    bind();
    drawKeyframes();
    drawTimeline();
  }

  function bind() {
    $('#title').addEventListener('input', (e) => save({ title: e.target.value }));
    $('#render').addEventListener('click', () => { if (!p.audioFile) return toast('Bitte zuerst einen Song hochladen', true); job('render'); });
    $('#audiofile').addEventListener('change', async (e) => {
      const fd = new FormData(); fd.append('file', e.target.files[0]);
      toast('Lade hoch …');
      try { p = await api(`/projects/${id}/upload/audio`, { method: 'POST', body: fd }); runJob(id, 'analyze', {}, reload); draw(); } catch (err) { toast(err.message, true); }
    });
    $('#analyze')?.addEventListener('click', () => runJob(id, 'analyze', {}, reload));
    if (!p.analysis) return;
    $('#theme').addEventListener('input', (e) => save({ theme: (p.theme = e.target.value) }));
    $('#mstyle').addEventListener('input', (e) => save({ style: (p.style = e.target.value) }));
    $('#lyrics').addEventListener('input', (e) => save({ lyrics: (p.lyrics = e.target.value) }));
    $('#mode').addEventListener('change', (e) => save({ mode: (p.mode = e.target.value) }));
    $$('[data-p]').forEach((el) => el.addEventListener('input', () => { p.reactive[el.dataset.p] = Number(el.value); $(`[data-v="${el.dataset.p}"]`).textContent = Number(el.value).toFixed(2); save({ reactive: p.reactive }); }));
    const PRESETS = {
      ruhig: { zoomDrift: 0.1, bassZoom: 0.03, rotation: 0.8, shake: 0, pan: 0.4, beatFlash: 0.05, crossfade: 2 },
      groove: { zoomDrift: 0.15, bassZoom: 0.12, rotation: 1.5, shake: 0.1, pan: 0.2, beatFlash: 0.2, crossfade: 0.6 },
      techno: { zoomDrift: 0.25, bassZoom: 0.25, rotation: 2.5, shake: 0.45, pan: 0, beatFlash: 0.5, crossfade: 0.15 },
      trip: { zoomDrift: 0.5, bassZoom: 0.15, rotation: 6, shake: 0.1, pan: 0.6, beatFlash: 0.3, crossfade: 1.5 },
    };
    $$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      p.reactive = { ...PRESETS[b.dataset.preset] }; save({ reactive: p.reactive });
      for (const [k] of PARAMS) { $(`[data-p="${k}"]`).value = p.reactive[k]; $(`[data-v="${k}"]`).textContent = (+p.reactive[k]).toFixed(2); }
    }));
    $('#autokf').addEventListener('click', () => { if (p.keyframes.length && !confirm('Bestehende Keyframes ersetzen?')) return; job('keyframes', {}, true); });
    $('#addkf').addEventListener('click', () => addKeyframe(audio()?.currentTime || 0));
    $('#genimgs').addEventListener('click', () => job('images'));
    $('#genall').addEventListener('click', () => confirm('Alle Bilder neu generieren?') && job('images', { force: true }));
    const au = audio();
    $('#play').addEventListener('click', () => { au.paused ? au.play() : au.pause(); });
    au.addEventListener('play', () => { $('#play').textContent = '⏸ Pause'; loop(); });
    au.addEventListener('pause', () => { $('#play').textContent = '▶ Abspielen'; });
    au.addEventListener('seeked', () => { drawTimeline(); drawPreview(); });
    const tl = $('#tl');
    tl.addEventListener('click', (e) => { au.currentTime = xToTime(e); drawTimeline(); drawPreview(); });
    tl.addEventListener('dblclick', (e) => addKeyframe(snap(xToTime(e))));
    window.addEventListener('resize', drawTimeline);
    drawPreview();
  }

  const audio = () => $('#audio');
  const xToTime = (e) => { const r = e.target.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * p.analysis.duration; };
  const snap = (t) => { const b = p.analysis.beats; if (!b.length) return t; return b.reduce((x, y) => (Math.abs(y - t) < Math.abs(x - t) ? y : x), b[0]); };

  function addKeyframe(t) {
    const prev = sorted().filter((k) => k.time <= t).pop();
    p.keyframes.push({ id: 'k' + Math.random().toString(36).slice(2, 8), time: +t.toFixed(3), prompt: prev?.prompt || p.theme || '', image: null, clip: null });
    saveKeys(); drawKeyframes(); drawTimeline();
  }

  function drawKeyframes() {
    const box = $('#kfs'); if (!box) return;
    const ks = sorted();
    const now = audio()?.currentTime || 0;
    const cur = ks.filter((k) => k.time <= now).pop();
    box.innerHTML = ks.length ? ks.map((k, i) => `
      <div class="kf ${cur?.id === k.id ? 'current' : ''}" data-k="${k.id}">
        <div class="thumb">${k.image ? `<img src="${esc(k.image)}">` : 'kein Bild'}</div>
        <div>
          <div class="row small"><b>#${i + 1}</b><span class="muted">bei</span>
            <input type="number" step="0.01" min="0" style="width:90px" data-kt="${k.id}" value="${k.time}"> s
            <button class="sm" data-ksnap="${k.id}" title="Auf nächsten Beat">♩ Beat</button><span class="grow"></span>
            <button class="sm" data-kimg="${k.id}">🖼</button><button class="sm danger" data-kdel="${k.id}">🗑</button></div>
          <textarea rows="2" style="margin-top:6px;font-size:13px" data-kp="${k.id}" placeholder="Was soll zu sehen sein?">${esc(k.prompt)}</textarea>
        </div>
      </div>`).join('') : '<div class="hint">Noch keine Keyframes. Klicke „Automatisch aus Song erstellen“ oder doppelklicke in die Timeline.</div>';
    const find = (kid) => p.keyframes.find((k) => k.id === kid);
    $$('[data-kp]', box).forEach((el) => el.addEventListener('input', () => { find(el.dataset.kp).prompt = el.value; saveKeys(); }));
    $$('[data-kt]', box).forEach((el) => el.addEventListener('change', () => { find(el.dataset.kt).time = Math.max(0, Number(el.value) || 0); saveKeys(); drawKeyframes(); drawTimeline(); }));
    $$('[data-ksnap]', box).forEach((el) => el.addEventListener('click', () => { const k = find(el.dataset.ksnap); k.time = snap(k.time); saveKeys(); drawKeyframes(); drawTimeline(); }));
    $$('[data-kdel]', box).forEach((el) => el.addEventListener('click', () => { p.keyframes = p.keyframes.filter((k) => k.id !== el.dataset.kdel); saveKeys(); drawKeyframes(); drawTimeline(); }));
    $$('[data-kimg]', box).forEach((el) => el.addEventListener('click', async () => { await api('/projects/' + id, { method: 'PUT', body: { keyframes: p.keyframes } }); job('images', { keyIds: [el.dataset.kimg] }); }));
    $$('.kf', box).forEach((el) => el.addEventListener('click', (e) => { if (e.target.closest('input,textarea,button')) return; const au = audio(); if (au) { au.currentTime = find(el.dataset.k).time + 0.01; } }));
    drawTimeline();
  }

  function drawTimeline() {
    const c = $('#tl'); const a = p.analysis; if (!c || !a) return;
    const dpr = window.devicePixelRatio || 1; const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);
    const X = (t) => (t / a.duration) * W;
    const colors = { intensiv: '#7c5cff22', mittel: '#22d3ee14', ruhig: '#ffffff08' };
    for (const s of a.sections) { g.fillStyle = colors[s.label]; g.fillRect(X(s.start), 0, X(s.end) - X(s.start), H); }
    g.fillStyle = '#4b5563';
    const mid = H * 0.55;
    a.wave.forEach((v, i) => { const x = (i / a.wave.length) * W; const h = v * H * 0.4; g.fillRect(x, mid - h, Math.max(1, W / a.wave.length - 0.3), h * 2); });
    g.fillStyle = '#22d3ee55';
    a.beats.forEach((b, i) => { g.fillRect(X(b), i % 4 === 0 ? H - 14 : H - 7, 1, i % 4 === 0 ? 14 : 7); });
    sorted().forEach((k, i) => {
      const x = X(k.time); g.fillStyle = '#7c5cff'; g.fillRect(x - 1, 0, 2, H);
      g.beginPath(); g.moveTo(x - 6, 0); g.lineTo(x + 6, 0); g.lineTo(x, 9); g.fill();
      g.fillStyle = '#e8e9ee'; g.font = '11px sans-serif'; g.fillText('#' + (i + 1), x + 4, 20);
    });
    const t = audio()?.currentTime || 0;
    g.fillStyle = '#fbbf24'; g.fillRect(X(t), 0, 2, H);
    const tm = $('#time'); if (tm) tm.textContent = `${fmtTime(t)} / ${fmtTime(a.duration)}`;
  }

  function getImg(url) {
    if (!url) return null;
    if (!imgCache.has(url)) { const im = new Image(); im.src = url; imgCache.set(url, im); }
    const im = imgCache.get(url); return im.complete && im.naturalWidth ? im : null;
  }

  // Gleiche Kamera-Logik wie der Server-Renderer (src/render/reactive.js), vereinfacht.
  function drawPreview() {
    const c = $('#pv'); const a = p.analysis; if (!c || !a) return;
    const g = c.getContext('2d'); const W = c.width, H = c.height;
    const t = audio()?.currentTime || 0; const r = p.reactive; const hz = a.hopHz;
    const ks = sorted(); if (ks.length) ks[0] = { ...ks[0], time: 0 };
    let k = ks.length - 1; for (let i = 0; i < ks.length; i++) if (ks[i].time <= t) k = i;
    const segStart = ks[k]?.time ?? 0, segEnd = ks[k + 1]?.time ?? a.duration;
    const cam = (start, end, idx) => {
      const u = t - start, len = Math.max(0.5, end - start);
      const bass = envAt(a.bass, t, hz), treble = envAt(a.treble, t, hz), on = envAt(a.onset, t, hz);
      const hash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
      return { zoom: Math.max(1, 1 + r.zoomDrift * (u / len) + r.bassZoom * bass * bass),
        angle: r.rotation * (Math.sin(u * 0.6 + idx) * 0.7 + (treble - 0.5) * 0.6),
        dx: (hash(t * 97.1) - 0.5) * r.shake * on * 0.08 + (r.pan || 0) * Math.sin(u * 0.25 + idx * 1.7) * 0.05, dy: (hash(t * 53.7 + 3) - 0.5) * r.shake * on * 0.08 };
    };
    const paint = (kf, cm, alpha) => {
      const im = getImg(kf?.image); g.globalAlpha = alpha;
      g.save(); g.translate(W / 2 - cm.dx * W, H / 2 - cm.dy * H); g.rotate(-cm.angle * Math.PI / 180); g.scale(cm.zoom * 1.0, cm.zoom * 1.0);
      if (im) g.drawImage(im, -W / 2, -H / 2, W, H);
      else { g.fillStyle = '#1f222b'; g.fillRect(-W / 2, -H / 2, W, H); g.fillStyle = '#9aa0ae'; g.font = '16px sans-serif'; g.textAlign = 'center'; g.fillText(kf ? 'Bild noch nicht generiert' : 'Keine Keyframes', 0, 0); }
      g.restore(); g.globalAlpha = 1;
    };
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    paint(ks[k], cam(segStart, segEnd, k), 1);
    const xf = Math.min(r.crossfade || 0, (segEnd - segStart) / 2);
    if (ks[k + 1] && xf > 0 && t > segEnd - xf) { const al = (t - (segEnd - xf)) / xf; paint(ks[k + 1], cam(segEnd, ks[k + 2]?.time ?? a.duration, k + 1), al * al * (3 - 2 * al)); }
    // Beat-Blitz
    const beats = a.beats; let lb = -99; for (const b of beats) { if (b <= t) lb = b; else break; }
    const flash = (r.beatFlash || 0) * Math.exp(-(t - lb) * 9) * (0.5 + envAt(a.bass, t, hz));
    if (flash > 0.003) { g.fillStyle = `rgba(255,255,255,${Math.min(0.6, flash * 0.6)})`; g.globalCompositeOperation = 'lighter'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
  }

  let lastKf = null;
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      drawTimeline(); drawPreview();
      const t = audio()?.currentTime || 0; const cur = sorted().filter((k) => k.time <= t).pop()?.id;
      if (cur !== lastKf) { lastKf = cur; $$('.kf').forEach((el) => el.classList.toggle('current', el.dataset.k === cur)); }
      if (audio() && !audio().paused) raf = requestAnimationFrame(step);
    };
    step();
  }

  draw();
  if (p.job?.state === 'läuft') watchJob(p.job.id, reload, refreshSoft);
  return () => { cancelAnimationFrame(raf); audio()?.pause(); window.removeEventListener('resize', drawTimeline); };
}
