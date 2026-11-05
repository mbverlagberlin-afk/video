// Film-Pipeline: Drehbuch → Analyse → Keyframes → Clips → Dialoge → fertiger Film.
import fs from 'node:fs';
import path from 'node:path';
import { getSettings } from '../config.js';
import { getProject, saveProject, projectDir, mediaUrl } from '../store.js';
import { analyzeScreenplay } from '../ai/screenplay.js';
import { generateImage } from '../ai/image.js';
import { imageToVideo } from '../ai/video.js';
import { speak } from '../ai/tts.js';
import { ffmpeg, probeDuration } from '../ffmpeg.js';

const allShots = (a) => a.scenes.flatMap((sc, si) => sc.shots.map((sh) => ({ sc, si, sh })));
const fileOf = (id, url) => url && path.join(projectDir(id), url.split(`/media/${id}/`)[1].split('?')[0]);
const stamp = () => '?v=' + Date.now().toString(36);

export function shotPrompt(project, sc, sh) {
  const a = project.analysis;
  const chars = a.characters.filter((c) => (sh.characters || []).some((n) => n.toLowerCase() === c.name.toLowerCase()));
  return [
    [a.visualStyle, project.style].filter(Boolean).join(', '),
    sh.camera, sh.description,
    sc.location && `Location: ${sc.location}${sc.timeOfDay ? ', ' + sc.timeOfDay : ''}`,
    chars.length && 'Characters: ' + chars.map((c) => `${c.name} – ${c.appearance}`).join('; '),
  ].filter(Boolean).join('. ');
}

export async function analyze(id, ctx) {
  const p = getProject(id);
  ctx.progress(0.05, 'Drehbuch wird analysiert');
  const analysis = await analyzeScreenplay(p.screenplay, p.style, ctx.log);
  // Vorhandene Stimmen-Zuordnung beibehalten
  for (const c of analysis.characters) {
    const old = p.analysis?.characters?.find((o) => o.name.toLowerCase() === c.name.toLowerCase());
    if (old?.voiceId) c.voiceId = old.voiceId;
  }
  p.analysis = analysis;
  if (analysis.title && (p.title === 'Neuer Film' || !p.title)) p.title = analysis.title;
  p.status = 'analysiert';
  saveProject(p);
  ctx.log(`${analysis.scenes.length} Szenen, ${allShots(analysis).length} Einstellungen, ${analysis.characters.length} Figuren erkannt.`);
}

async function forEachShot(id, ctx, label, from, to, filter, fn) {
  const p = getProject(id);
  if (!p.analysis) throw new Error('Bitte zuerst das Drehbuch analysieren.');
  const list = allShots(p.analysis).filter(filter);
  let i = 0;
  for (const item of list) {
    ctx.checkCancel();
    ctx.progress(from + (to - from) * (i / Math.max(1, list.length)), `${label} ${++i}/${list.length}`);
    const fresh = getProject(id); // neu laden: Nutzer kann parallel Prompts bearbeiten
    const sh = fresh.analysis.scenes[item.si].shots.find((s) => s.id === item.sh.id);
    if (!sh) continue;
    await fn(fresh, fresh.analysis.scenes[item.si], sh, item.si);
    saveProject(fresh);
  }
}

export async function images(id, ctx, { shotIds, force } = {}) {
  const dir = path.join(projectDir(id), 'shots'); fs.mkdirSync(dir, { recursive: true });
  const seedBase = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) * 1000;
  await forEachShot(id, ctx, 'Keyframe', 0, 1, ({ sh }) => (shotIds ? shotIds.includes(sh.id) : force || !sh.image), async (p, sc, sh, si) => {
    const dest = path.join(dir, `${sh.id}.png`);
    const prompt = sh.promptOverride?.trim() || shotPrompt(p, sc, sh);
    await generateImage({ prompt, seed: seedBase + si, dest, log: ctx.log, caption: sh.description });
    sh.image = mediaUrl(id, `shots/${sh.id}.png`) + stamp();
    sh.clip = null; sh.status = 'bild';
  });
}

export async function clips(id, ctx, { shotIds, force } = {}) {
  const dir = path.join(projectDir(id), 'shots');
  await forEachShot(id, ctx, 'Videoclip', 0, 1, ({ sh }) => (shotIds ? shotIds.includes(sh.id) : force || !sh.clip), async (p, sc, sh) => {
    if (!sh.image) { ctx.log(`${sh.id}: kein Keyframe – wird zuerst erzeugt`); await images(id, { ...ctx, progress: () => {} }, { shotIds: [sh.id] }); Object.assign(sh, getProject(id).analysis.scenes.flatMap((s) => s.shots).find((s) => s.id === sh.id)); }
    const dest = path.join(dir, `${sh.id}.mp4`);
    await imageToVideo({ image: fileOf(id, sh.image), prompt: `${sh.camera}. ${sh.description}`, duration: sh.duration, dest, log: ctx.log });
    sh.clip = mediaUrl(id, `shots/${sh.id}.mp4`) + stamp(); sh.status = 'clip';
  });
}

export async function dialogue(id, ctx, { shotIds, force } = {}) {
  const dir = path.join(projectDir(id), 'audio'); fs.mkdirSync(dir, { recursive: true });
  await forEachShot(id, ctx, 'Dialog', 0, 1, ({ sh }) => sh.dialogue?.length && (shotIds ? shotIds.includes(sh.id) : force || !sh.audio), async (p, sc, sh) => {
    const parts = [];
    for (const [i, d] of sh.dialogue.entries()) {
      const ch = p.analysis.characters.find((c) => c.name.toLowerCase() === d.character.toLowerCase());
      const f = path.join(dir, `${sh.id}_${i}.wav`);
      await speak({ text: d.line, voiceId: ch?.voiceId, dest: f });
      parts.push({ file: f, dur: await probeDuration(f), character: d.character, line: d.line });
    }
    // Zeilen mit kurzen Pausen hintereinander setzen
    const out = path.join(dir, `${sh.id}.wav`);
    const inputs = parts.flatMap((x) => ['-i', x.file]);
    const filter = parts.map((_, i) => `[${i}]apad=pad_dur=0.35[a${i}]`).join(';') + ';' + parts.map((_, i) => `[a${i}]`).join('') + `concat=n=${parts.length}:v=0:a=1,adelay=300|300[o]`;
    await ffmpeg([...inputs, '-filter_complex', filter, '-map', '[o]', '-ar', '48000', '-ac', '2', out]);
    let t = 0.3;
    sh.lines = parts.map((x) => { const r = { character: x.character, line: x.line, start: t, end: t + x.dur }; t += x.dur + 0.35; return r; });
    sh.audioDuration = t;
    sh.audio = mediaUrl(id, `audio/${sh.id}.wav`) + stamp();
    for (const x of parts) fs.rmSync(x.file, { force: true });
  });
}

const srtTime = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };

export async function render(id, ctx) {
  const s = getSettings();
  let p = getProject(id);
  if (!p.analysis) throw new Error('Bitte zuerst das Drehbuch analysieren.');
  // Fehlendes automatisch nachziehen
  const shots = allShots(p.analysis);
  if (shots.some(({ sh }) => !sh.image)) { ctx.progress(0.02, 'Fehlende Keyframes erzeugen'); await images(id, sub(ctx, 0.02, 0.3)); }
  if (shots.some(({ sh }) => !sh.clip)) { ctx.progress(0.3, 'Fehlende Clips erzeugen'); await clips(id, sub(ctx, 0.3, 0.6)); }
  if (shots.some(({ sh }) => sh.dialogue?.length && !sh.audio)) { ctx.progress(0.6, 'Fehlende Dialoge vertonen'); await dialogue(id, sub(ctx, 0.6, 0.7)); }
  p = getProject(id);

  const work = path.join(projectDir(id), 'render'); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const segs = []; const srt = []; let t0 = 0; let n = 1;
  const list = allShots(p.analysis);
  for (const [i, { sh }] of list.entries()) {
    ctx.checkCancel();
    ctx.progress(0.7 + 0.22 * (i / list.length), `Montage ${i + 1}/${list.length}`);
    const dur = Math.max(sh.duration, (sh.audioDuration || 0) + 0.4);
    const clip = fileOf(id, sh.clip);
    const clipDur = await probeDuration(clip);
    const seg = path.join(work, `seg${String(i).padStart(4, '0')}.mp4`);
    // Zu kurze Clips: leicht verlangsamen (bis 1,5x), danach letztes Bild halten.
    const slow = clipDur > 0 && clipDur < dur ? Math.min(1.5, dur / clipDur) : 1;
    const vf = `setpts=${slow.toFixed(4)}*PTS,scale=${s.width}:${s.height}:force_original_aspect_ratio=increase,crop=${s.width}:${s.height},fps=${s.fps},tpad=stop_mode=clone:stop_duration=${dur},format=yuv420p`;
    const audioIn = sh.audio ? ['-i', fileOf(id, sh.audio)] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
    await ffmpeg(['-i', clip, ...audioIn, '-filter_complex', `[0:v]${vf}[v];[1:a]aresample=48000,apad[a]`, '-map', '[v]', '-map', '[a]', '-t', dur.toFixed(3),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-r', String(s.fps), '-c:a', 'aac', '-ar', '48000', '-ac', '2', seg]);
    segs.push(seg);
    for (const l of sh.lines || []) srt.push(`${n++}\n${srtTime(t0 + l.start)} --> ${srtTime(t0 + l.end)}\n${l.character}: ${l.line}\n`);
    t0 += dur;
  }
  fs.writeFileSync(path.join(work, 'list.txt'), segs.map((f) => `file '${path.basename(f)}'`).join('\n'));
  ctx.progress(0.93, 'Zusammenfügen');
  const joined = path.join(work, 'joined.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', joined]);
  const srtFile = path.join(projectDir(id), 'film.srt');
  fs.writeFileSync(srtFile, srt.join('\n'));

  const out = path.join(projectDir(id), 'film.mp4');
  const args = ['-i', joined]; const filters = []; let vmap = '0:v', amap = '0:a';
  if (p.subtitles && srt.length) { filters.push(`[0:v]subtitles='${srtFile.replace(/'/g, "\\'").replace(/:/g, '\\:')}':force_style='FontName=DejaVu Sans,FontSize=20,Outline=2'[v]`); vmap = '[v]'; }
  if (p.musicFile) {
    args.push('-stream_loop', '-1', '-i', path.join(projectDir(id), p.musicFile));
    // Musik unter Dialoge legen, Dialoge drücken die Musik leicht (Ducking)
    filters.push(`[1:a]volume=${Number(p.musicVolume) || 0.25}[m];[m][0:a]sidechaincompress=threshold=0.05:ratio=6:release=400[md];[0:a][md]amix=inputs=2:duration=first:normalize=0[a]`);
    amap = '[a]';
  }
  ctx.progress(0.95, 'Finale Kodierung');
  if (filters.length) {
    await ffmpeg([...args, '-filter_complex', filters.join(';'), '-map', vmap, '-map', amap, '-c:v', vmap === '0:v' ? 'copy' : 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', t0.toFixed(3), out]);
  } else {
    await ffmpeg(['-i', joined, '-c', 'copy', '-movflags', '+faststart', out]);
  }
  fs.rmSync(work, { recursive: true, force: true });
  p = getProject(id);
  p.output = mediaUrl(id, 'film.mp4') + stamp();
  p.subtitleFile = mediaUrl(id, 'film.srt');
  p.status = 'fertig';
  saveProject(p);
  ctx.log(`Film fertig: ${t0.toFixed(1)} s`);
}

export async function all(id, ctx) {
  const p = getProject(id);
  if (!p.analysis) { await analyze(id, sub(ctx, 0, 0.1)); }
  await render(id, ctx);
}

function sub(ctx, from, to) {
  return { ...ctx, progress: (x, step) => ctx.progress(from + (to - from) * x, step) };
}
