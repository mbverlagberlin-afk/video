// Musikvideo-Pipeline: Audio analysieren → Prompt-Keyframes → Bilder → audio-reaktives Rendering oder KI-Clips.
import fs from 'node:fs';
import path from 'node:path';
import { getSettings } from '../config.js';
import { getProject, saveProject, projectDir, mediaUrl } from '../store.js';
import { analyzeAudio } from '../audio/analyze.js';
import { generateImage } from '../ai/image.js';
import { imageToVideo } from '../ai/video.js';
import { claudeAvailable, claudeJSON } from '../ai/claude.js';
import { renderReactive } from '../render/reactive.js';
import { ffmpeg, probeDuration } from '../ffmpeg.js';

const stamp = () => '?v=' + Date.now().toString(36);
const fileOf = (id, url) => url && path.join(projectDir(id), url.split(`/media/${id}/`)[1].split('?')[0]);
const kid = () => 'k' + Math.random().toString(36).slice(2, 8);

export async function analyze(id, ctx) {
  const p = getProject(id);
  if (!p.audioFile) throw new Error('Bitte zuerst eine Audiodatei hochladen.');
  ctx.progress(0.1, 'Audio wird analysiert (Tempo, Beats, Energie)');
  p.analysis = await analyzeAudio(path.join(projectDir(id), p.audioFile));
  p.status = 'analysiert';
  saveProject(p);
  ctx.log(`Dauer ${p.analysis.duration.toFixed(1)} s · ${p.analysis.bpm} BPM · ${p.analysis.beats.length} Beats · ${p.analysis.sections.length} Abschnitte`);
}

const VARIATIONS = ['wide panoramic vista', 'intimate close-up with rich detail', 'abstract flowing shapes', 'dramatic silhouette against light', 'aerial view', 'kaleidoscopic symmetric pattern', 'macro texture', 'cosmic scale'];

/** Erstellt automatisch Prompt-Keyframes pro Abschnitt (mit Claude, sonst regelbasiert). */
export async function autoKeyframes(id, ctx) {
  const p = getProject(id);
  if (!p.analysis) await analyze(id, ctx);
  const a = getProject(id).analysis;
  ctx.progress(0.5, 'Prompts für Abschnitte werden erstellt');
  let prompts;
  if (claudeAvailable()) {
    const schema = { type: 'object', additionalProperties: false, required: ['prompts'], properties: { prompts: { type: 'array', items: { type: 'string' } } } };
    const r = await claudeJSON({ schema, effort: 'medium',
      system: 'Du bist ein visionärer Musikvideo-Regisseur. Du schreibst bildstarke englische Prompts für einen KI-Bildgenerator. Jeder Prompt ist eigenständig, beschreibt Motiv, Farben, Licht und Stimmung, und passt zur Energie des Abschnitts. Die Prompts erzählen zusammen eine visuelle Reise mit wiederkehrenden Motiven.',
      prompt: `Thema: ${p.theme || 'frei'}\nStil: ${p.style}\nTempo: ${a.bpm} BPM\n${p.lyrics ? `Songtext:\n${p.lyrics}\n` : ''}\nAbschnitte (genau ${a.sections.length} Prompts in dieser Reihenfolge):\n` +
        a.sections.map((s, i) => `${i + 1}. ${s.start.toFixed(1)}–${s.end.toFixed(1)} s, Energie: ${s.label}`).join('\n') });
    prompts = r.prompts;
  } else {
    prompts = a.sections.map((s, i) => `${p.theme || 'dreamlike landscape'}, ${VARIATIONS[i % VARIATIONS.length]}, ${s.label === 'intensiv' ? 'explosive energy, vivid saturated colors, motion' : s.label === 'ruhig' ? 'calm, soft light, gentle mist' : 'flowing, luminous'}`);
  }
  const fresh = getProject(id);
  fresh.keyframes = a.sections.map((s, i) => ({ id: kid(), time: s.start, prompt: prompts[i] || prompts[prompts.length - 1] || p.theme, image: null, clip: null }));
  saveProject(fresh);
  ctx.log(`${fresh.keyframes.length} Keyframes angelegt.`);
}

function segmentsOf(p) {
  const ks = [...p.keyframes].sort((a, b) => a.time - b.time);
  if (!ks.length) throw new Error('Keine Keyframes vorhanden – bitte anlegen oder automatisch erstellen.');
  ks[0] = { ...ks[0], time: 0 };
  return ks.map((k, i) => ({ k, start: i === 0 ? 0 : k.time, end: ks[i + 1]?.time ?? p.analysis.duration }));
}

export async function images(id, ctx, { keyIds, force } = {}) {
  const dir = path.join(projectDir(id), 'frames'); fs.mkdirSync(dir, { recursive: true });
  const p = getProject(id);
  const todo = p.keyframes.filter((k) => (keyIds ? keyIds.includes(k.id) : force || !k.image));
  for (const [i, k] of todo.entries()) {
    ctx.checkCancel();
    ctx.progress(i / todo.length, `Bild ${i + 1}/${todo.length}`);
    const dest = path.join(dir, `${k.id}.png`);
    await generateImage({ prompt: `${k.prompt}, ${p.style}`, seed: 4242 + i, dest, log: ctx.log, caption: k.prompt });
    const fresh = getProject(id); const fk = fresh.keyframes.find((x) => x.id === k.id);
    if (fk) { fk.image = mediaUrl(id, `frames/${k.id}.png`) + stamp(); fk.clip = null; saveProject(fresh); }
  }
}

export async function render(id, ctx) {
  const s = getSettings();
  let p = getProject(id);
  if (!p.analysis) await analyze(id, sub(ctx, 0, 0.05));
  p = getProject(id);
  if (!p.keyframes.length) await autoKeyframes(id, sub(ctx, 0.05, 0.1));
  p = getProject(id);
  if (p.keyframes.some((k) => !k.image)) { ctx.progress(0.1, 'Fehlende Bilder erzeugen'); await images(id, sub(ctx, 0.1, 0.35)); }
  p = getProject(id);
  const segs = segmentsOf(p);
  const audio = path.join(projectDir(id), p.audioFile);
  const out = path.join(projectDir(id), 'musikvideo.mp4');
  const tmp = out + '.tmp.mp4';

  if (p.mode === 'ki-clips') {
    const dir = path.join(projectDir(id), 'clips'); fs.mkdirSync(dir, { recursive: true });
    const parts = [];
    for (const [i, sg] of segs.entries()) {
      ctx.checkCancel();
      ctx.progress(0.35 + 0.5 * i / segs.length, `KI-Clip ${i + 1}/${segs.length}`);
      const len = sg.end - sg.start;
      let clip = fileOf(id, sg.k.clip);
      if (!clip || !fs.existsSync(clip)) {
        clip = path.join(dir, `${sg.k.id}.mp4`);
        await imageToVideo({ image: fileOf(id, sg.k.image), prompt: sg.k.prompt, duration: Math.min(10, len), dest: clip, log: ctx.log });
        const fresh = getProject(id); const fk = fresh.keyframes.find((x) => x.id === sg.k.id); if (fk) { fk.clip = mediaUrl(id, `clips/${sg.k.id}.mp4`) + stamp(); saveProject(fresh); }
      }
      // Clip auf Segmentlänge bringen: bis 2x verlangsamen, danach letztes Bild halten
      const cd = await probeDuration(clip);
      const slow = Math.min(2, Math.max(1, len / Math.max(0.1, cd)));
      const part = path.join(dir, `part${i}.mp4`);
      await ffmpeg(['-i', clip, '-vf', `setpts=${slow.toFixed(4)}*PTS,scale=${s.width}:${s.height}:force_original_aspect_ratio=increase,crop=${s.width}:${s.height},fps=${s.fps},tpad=stop_mode=clone:stop_duration=${len.toFixed(3)},format=yuv420p`,
        '-t', len.toFixed(3), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', part]);
      parts.push(part);
    }
    fs.writeFileSync(path.join(dir, 'list.txt'), parts.map((f) => `file '${path.basename(f)}'`).join('\n'));
    ctx.progress(0.9, 'Zusammenfügen mit Musik');
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', tmp]);
    for (const f of parts) fs.rmSync(f, { force: true });
  } else {
    ctx.progress(0.35, 'Audio-reaktives Rendering');
    await renderReactive({
      segments: segs.map((sg) => ({ start: sg.start, end: sg.end, image: fileOf(id, sg.k.image) })),
      analysis: p.analysis, params: p.reactive, width: s.width, height: s.height, fps: s.fps, audio, out: tmp,
      onProgress: (x) => ctx.progress(0.35 + 0.63 * x, `Rendering ${Math.round(x * 100)} %`), checkCancel: ctx.checkCancel,
    });
  }
  fs.renameSync(tmp, out);
  p = getProject(id);
  p.output = mediaUrl(id, 'musikvideo.mp4') + stamp();
  p.status = 'fertig';
  saveProject(p);
}

function sub(ctx, from, to) {
  return { ...ctx, progress: (x, step) => ctx.progress(from + (to - from) * x, step) };
}
