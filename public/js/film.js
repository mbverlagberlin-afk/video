import { $, $$, esc, api, toast, debounce, runJob, watchJob } from './util.js';

const SAMPLE = `Title: Der letzte Leuchtturm

EXT. KLIPPE AM MEER - ABENDDÄMMERUNG

Ein einsamer Leuchtturm auf einer schroffen Klippe. Sturmwolken ziehen auf, Wellen brechen sich an den Felsen.

MARA (30), wetterfeste gelbe Regenjacke, rote Haare, kämpft sich den schmalen Pfad hinauf.

MARA
Noch zehn Minuten, dann ist das Licht aus. Für immer.

INT. LEUCHTTURM - LAMPENRAUM - NACHT

Messing, Glas und Staub. Die gewaltige Linse dreht sich langsam. Der alte Wärter JONAS (70), weißer Bart, dicker Wollpullover, sitzt neben einer Thermoskanne.

JONAS
Du bist spät. Das Meer wartet nicht.

MARA
Die Behörde sagt, Schiffe brauchen uns nicht mehr.

JONAS
(lächelt)
Schiffe vielleicht nicht. Aber jemand da draußen schon.

Mara blickt aus dem Fenster. Weit draußen blinkt ein winziges Licht – ein kleines Boot im Sturm.

EXT. MEER - NACHT

Ein Fischerboot kämpft gegen meterhohe Wellen. Der Lichtstrahl des Leuchtturms streift es und weist den Weg.`;

export async function renderFilm(app, id) {
  let p = await api('/projects/' + id);
  let tab = p.output ? 'film' : p.analysis ? 'storyboard' : 'drehbuch';
  let voices = [];
  api('/voices').then((v) => { voices = v; if (tab === 'storyboard') draw(); }).catch(() => {});

  const save = debounce(async (patch) => { try { p = { ...p, ...(await api('/projects/' + id, { method: 'PUT', body: patch })) }; } catch (e) { toast(e.message, true); } }, 700);
  const saveAnalysis = () => save({ analysis: p.analysis });
  const reload = async () => { p = await api('/projects/' + id); draw(); };
  const job = (action, body) => runJob(id, action, body, reload, () => api('/projects/' + id).then((np) => { p = np; if (tab !== 'drehbuch') drawContent(); }));

  function draw() {
    app.innerHTML = `
      <div class="row" style="margin-bottom:12px"><a href="#/">← Projekte</a></div>
      <div class="row"><input id="title" class="grow" style="font-size:1.4rem;font-weight:700;background:none;border-color:transparent" value="${esc(p.title)}">
        <button class="primary" id="runall">▶ Alles generieren</button></div>
      <div class="tabs">
        <button data-tab="drehbuch">1 · Drehbuch</button>
        <button data-tab="storyboard" ${p.analysis ? '' : 'disabled'}>2 · Storyboard</button>
        <button data-tab="film" ${p.analysis ? '' : 'disabled'}>3 · Film</button>
      </div>
      <div id="content"></div>`;
    $('#title').addEventListener('input', (e) => save({ title: e.target.value }));
    $('#runall').addEventListener('click', () => { tab = 'film'; draw(); job('all'); });
    $$('[data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === tab); b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }); });
    drawContent();
  }

  function drawContent() {
    const c = $('#content'); if (!c) return;
    if (tab === 'drehbuch') return drawScreenplay(c);
    if (tab === 'storyboard') return drawStoryboard(c);
    return drawOutput(c);
  }

  function drawScreenplay(c) {
    c.innerHTML = `
      <div class="two">
        <div class="panel">
          <div class="row"><h2 class="grow">Drehbuch</h2>
            <button class="sm" id="sample">Beispiel laden</button>
            <label class="btn sm" style="margin:0;color:var(--text)">Datei öffnen<input type="file" id="spfile" accept=".txt,.fountain,.md" hidden></label></div>
          <textarea id="sp" class="screenplay" placeholder="INT. KÜCHE - TAG&#10;&#10;Anna steht am Fenster.&#10;&#10;ANNA&#10;Es regnet schon wieder.">${esc(p.screenplay)}</textarea>
        </div>
        <div>
          <div class="panel"><h2>Visueller Stil</h2>
            <textarea id="style" rows="3">${esc(p.style)}</textarea>
            <div class="row small" style="margin-top:8px">${['filmisch, 35mm, natürliches Licht', 'Animationsfilm im Pixar-Stil, 3D', 'Film noir, schwarz-weiß, harte Schatten', 'Anime, Studio-Ghibli-Stimmung, Aquarell', 'Dokumentarisch, Handkamera', 'Cyberpunk, Neonlicht, Regen']
              .map((s) => `<button class="sm" data-style="${esc(s)}">${esc(s.split(',')[0])}</button>`).join('')}</div>
          </div>
          <div class="panel"><h2>Analyse</h2>
            <p class="muted small">Die KI zerlegt das Drehbuch in Figuren (mit fester Optik für Konsistenz), Szenen und einzelne Einstellungen mit Kamera, Dauer und Dialog. Danach kannst du alles im Storyboard bearbeiten.</p>
            <p class="small">Format: Standard-Drehbuchformat oder <a href="https://fountain.io/syntax" target="_blank">Fountain</a> – Szenenköpfe mit INT./EXT. (oder INNEN/AUSSEN), Figurennamen in GROSSBUCHSTABEN über dem Dialog.</p>
            <button class="primary" id="analyze">🔍 Drehbuch analysieren</button>
            ${p.analysis ? `<p class="small muted">Zuletzt analysiert: ${p.analysis.scenes.length} Szenen. Erneutes Analysieren ersetzt das Storyboard.</p>` : ''}
          </div>
        </div>
      </div>`;
    $('#sp').addEventListener('input', (e) => { p.screenplay = e.target.value; save({ screenplay: p.screenplay }); });
    $('#style').addEventListener('input', (e) => { p.style = e.target.value; save({ style: p.style }); });
    $$('[data-style]').forEach((b) => b.addEventListener('click', () => { $('#style').value = b.dataset.style; p.style = b.dataset.style; save({ style: p.style }); }));
    $('#sample').addEventListener('click', () => { $('#sp').value = SAMPLE; p.screenplay = SAMPLE; save({ screenplay: SAMPLE }); });
    $('#spfile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const text = await f.text(); $('#sp').value = text; p.screenplay = text; save({ screenplay: text });
    });
    $('#analyze').addEventListener('click', async () => {
      if (p.analysis && !confirm('Storyboard neu erstellen? Bisherige Bilder und Clips der Einstellungen gehen verloren.')) return;
      await api('/projects/' + id, { method: 'PUT', body: { screenplay: $('#sp').value, style: $('#style').value } });
      runJob(id, 'analyze', {}, async (j) => { await reload(); if (j.state === 'fertig') { tab = 'storyboard'; draw(); } });
    });
  }

  function drawStoryboard(c) {
    const a = p.analysis;
    const shots = a.scenes.flatMap((s) => s.shots);
    const done = (k) => shots.filter((s) => s[k]).length;
    const total = shots.reduce((x, s) => x + s.duration, 0);
    c.innerHTML = `
      <div class="panel">
        <div class="row">
          <div class="grow"><h2>${esc(a.title)}</h2><div class="muted small">${esc(a.logline || '')}</div></div>
          <span class="stat"><b>${a.scenes.length}</b><span>Szenen</span></span>
          <span class="stat"><b>${shots.length}</b><span>Einstellungen</span></span>
          <span class="stat"><b>${Math.round(total)} s</b><span>Laufzeit ca.</span></span>
        </div>
        <label>Stil-Prompt für den ganzen Film</label>
        <input id="vstyle" value="${esc(a.visualStyle || '')}">
        <div class="row" style="margin-top:12px">
          <button id="b-img">🖼 Fehlende Bilder (${done('image')}/${shots.length})</button>
          <button id="b-clip">🎞 Fehlende Clips (${done('clip')}/${shots.length})</button>
          <button id="b-tts">🗣 Dialoge vertonen (${done('audio')}/${shots.filter((s) => s.dialogue?.length).length})</button>
          <button id="b-img-all" class="sm">Alle Bilder neu</button>
          <span class="grow"></span>
          <button class="primary" id="b-render">🎬 Film rendern</button>
        </div>
      </div>
      <div class="panel"><h2>Figuren</h2><p class="small muted">Die Optik-Beschreibung wird in jeden Bild-Prompt eingefügt, in dem die Figur vorkommt – so bleibt sie über den Film hinweg wiedererkennbar.</p>
        <div class="grid">${a.characters.map((ch, i) => `
          <div class="card"><div class="body">
            <input data-ch="${i}" data-f="name" value="${esc(ch.name)}" style="font-weight:600">
            <label>Aussehen (englisch)</label><textarea data-ch="${i}" data-f="appearance" rows="3">${esc(ch.appearance)}</textarea>
            <label>Stimme – ${esc(ch.voice)}</label>
            <select data-ch="${i}" data-f="voiceId"><option value="">– Standard –</option>${voices.map((v) => `<option value="${esc(v.id)}" ${v.id === ch.voiceId ? 'selected' : ''}>${esc(v.name)}${v.description ? ' · ' + esc(v.description) : ''}</option>`).join('')}</select>
          </div></div>`).join('') || '<p class="muted">Keine Figuren erkannt.</p>'}</div>
      </div>
      ${a.scenes.map((sc, si) => `
        <div class="scene-head"><h3>${esc(sc.heading)}</h3><span class="muted small">${esc(sc.summary || '')}</span></div>
        <div class="grid">${sc.shots.map((sh, hi) => shotCard(sh, si, hi)).join('')}</div>`).join('')}`;

    $('#vstyle').addEventListener('input', (e) => { a.visualStyle = e.target.value; saveAnalysis(); });
    $('#b-img').addEventListener('click', () => job('images'));
    $('#b-img-all').addEventListener('click', () => confirm('Alle Bilder neu generieren?') && job('images', { force: true }));
    $('#b-clip').addEventListener('click', () => job('clips'));
    $('#b-tts').addEventListener('click', () => job('dialogue', { force: true }));
    $('#b-render').addEventListener('click', () => { tab = 'film'; draw(); job('render'); });
    $$('[data-ch]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      a.characters[el.dataset.ch][el.dataset.f] = el.value; saveAnalysis();
      if (el.dataset.f === 'voiceId') { for (const s of shots) if (s.dialogue?.some((d) => d.character.toLowerCase() === a.characters[el.dataset.ch].name.toLowerCase())) s.audio = null; }
    }));
    $$('[data-shot]').forEach((el) => el.addEventListener('input', () => {
      const [si, hi] = el.dataset.shot.split(':').map(Number); const sh = a.scenes[si].shots[hi];
      const f = el.dataset.f;
      if (f === 'duration') sh.duration = Math.max(1, Math.min(20, Number(el.value) || 4));
      else if (f === 'dialogue') { sh.dialogue = el.value.split('\n').filter((l) => l.includes(':')).map((l) => ({ character: l.split(':')[0].trim(), line: l.split(':').slice(1).join(':').trim() })); sh.audio = null; sh.characters = [...new Set([...(sh.characters || []), ...sh.dialogue.map((d) => d.character)])]; }
      else sh[f] = el.value;
      saveAnalysis();
    }));
    $$('[data-act]').forEach((el) => el.addEventListener('click', async () => {
      const [act, si, hi] = el.dataset.act.split(':'); const sc = a.scenes[+si]; const sh = sc.shots[+hi];
      if (act === 'img') job('images', { shotIds: [sh.id] });
      if (act === 'clip') job('clips', { shotIds: [sh.id] });
      if (act === 'tts') job('dialogue', { shotIds: [sh.id] });
      if (act === 'del' && confirm('Einstellung löschen?')) { sc.shots.splice(+hi, 1); await api('/projects/' + id, { method: 'PUT', body: { analysis: a } }); drawContent(); }
      if (act === 'add') { sc.shots.splice(+hi + 1, 0, { id: 'sh' + Date.now().toString(36), description: '', camera: 'medium shot', duration: 4, characters: [], dialogue: [], image: null, clip: null, audio: null }); await api('/projects/' + id, { method: 'PUT', body: { analysis: a } }); drawContent(); }
    }));
  }

  function shotCard(sh, si, hi) {
    const k = `${si}:${hi}`;
    return `<div class="card">
      <div class="media">${sh.clip ? `<video src="${esc(sh.clip)}" poster="${esc(sh.image || '')}" controls muted loop preload="none"></video>` : sh.image ? `<img src="${esc(sh.image)}" loading="lazy">` : 'noch kein Bild'}</div>
      <div class="body">
        <div class="row small"><b class="grow">Einstellung ${hi + 1}</b>
          ${sh.image ? '<span class="badge ok">Bild</span>' : ''}${sh.clip ? '<span class="badge ok">Clip</span>' : ''}${sh.audio ? '<span class="badge ok">Ton</span>' : ''}</div>
        <textarea data-shot="${k}" data-f="description" placeholder="Was ist zu sehen? (englisch funktioniert am besten)">${esc(sh.description)}</textarea>
        <div class="row"><input class="grow" data-shot="${k}" data-f="camera" value="${esc(sh.camera)}" placeholder="Kamera">
          <input style="width:70px" type="number" min="1" max="20" step="0.5" data-shot="${k}" data-f="duration" value="${sh.duration}" title="Dauer in Sekunden"></div>
        <textarea data-shot="${k}" data-f="dialogue" rows="2" placeholder="FIGUR: Dialogzeile">${esc((sh.dialogue || []).map((d) => `${d.character}: ${d.line}`).join('\n'))}</textarea>
        ${sh.audio ? `<audio src="${esc(sh.audio)}" controls preload="none" style="width:100%;height:32px"></audio>` : ''}
        <div class="row">
          <button class="sm" data-act="img:${k}">🖼 Bild</button><button class="sm" data-act="clip:${k}">🎞 Clip</button>
          ${sh.dialogue?.length ? `<button class="sm" data-act="tts:${k}">🗣 Ton</button>` : ''}
          <span class="grow"></span><button class="sm" data-act="add:${k}" title="Einstellung danach einfügen">＋</button><button class="sm danger" data-act="del:${k}" title="Löschen">🗑</button>
        </div>
      </div></div>`;
  }

  function drawOutput(c) {
    c.innerHTML = `
      <div class="two">
        <div class="panel">
          ${p.output ? `<video class="output" src="${esc(p.output)}" controls></video>
            <div class="row" style="margin-top:10px"><a class="btn" href="${esc(p.output.split('?')[0])}" download>⬇ Film herunterladen (MP4)</a>
            ${p.subtitleFile ? `<a class="btn" href="${esc(p.subtitleFile)}" download>⬇ Untertitel (SRT)</a>` : ''}</div>`
            : '<div class="empty">Noch kein Film gerendert.</div>'}
        </div>
        <div class="panel"><h2>Ausgabe</h2>
          <label><input type="checkbox" id="subs" ${p.subtitles ? 'checked' : ''}> Untertitel einbrennen</label>
          <label>Hintergrundmusik (optional) ${p.musicFile ? '– <span style="color:var(--ok)">hochgeladen</span>' : ''}</label>
          <input type="file" id="music" accept="audio/*">
          <div class="slider" style="margin-top:8px"><span>Musiklautstärke</span><input type="range" id="mvol" min="0" max="1" step="0.05" value="${p.musicVolume}"><span id="mvolv">${Math.round(p.musicVolume * 100)} %</span></div>
          <p class="small muted">Beim Rendern werden fehlende Bilder, Clips und Dialoge automatisch erzeugt. Die Musik wird unter Dialogen automatisch leiser (Ducking).</p>
          <button class="primary" id="render">🎬 Film rendern</button>
        </div>
      </div>`;
    $('#subs').addEventListener('change', (e) => save({ subtitles: e.target.checked }));
    $('#mvol').addEventListener('input', (e) => { $('#mvolv').textContent = Math.round(e.target.value * 100) + ' %'; save({ musicVolume: Number(e.target.value) }); });
    $('#music').addEventListener('change', async (e) => {
      const fd = new FormData(); fd.append('file', e.target.files[0]);
      try { p = { ...p, ...(await api(`/projects/${id}/upload/music`, { method: 'POST', body: fd })) }; toast('Musik hochgeladen'); drawContent(); } catch (err) { toast(err.message, true); }
    });
    $('#render').addEventListener('click', () => job('render'));
  }

  draw();
  if (p.job?.state === 'läuft') watchJob(p.job.id, reload);
  return () => {};
}
