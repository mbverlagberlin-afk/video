// Audio-reaktiver Renderer (ähnlich Neural Frames / Deforum): Keyframe-Bilder werden pro Frame
// gezoomt, gedreht, geschüttelt und überblendet – gesteuert von Bass, Höhen, Onsets und Beats.
import sharp from 'sharp';
import { rawVideoWriter } from '../ffmpeg.js';
import { envAt } from '../audio/analyze.js';

const MARGIN = 1.3; // Quellbild größer als Ausgabe → Reserve für Drehung/Schütteln

async function prepare(file, w, h) {
  const W = Math.round(w * MARGIN), H = Math.round(h * MARGIN);
  const data = await sharp(file).resize(W, H, { fit: 'cover' }).removeAlpha().raw().toBuffer();
  return { data, W, H };
}

function hash(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

/** Kamera-Parameter für Zeit t innerhalb eines Segments. */
export function cameraAt(t, seg, analysis, p) {
  const u = t - seg.start; const len = Math.max(0.5, seg.end - seg.start);
  const bass = envAt(analysis.bass, t), treble = envAt(analysis.treble, t), onset = envAt(analysis.onset, t);
  const zoom = 1 + (p.zoomDrift || 0) * (u / len) + (p.bassZoom || 0) * bass * bass;
  const angle = (p.rotation || 0) * (Math.sin(u * 0.6 + seg.index) * 0.7 + (treble - 0.5) * 0.6);
  const sh = (p.shake || 0) * onset;
  const dx = (hash(t * 97.1) - 0.5) * sh * 0.08, dy = (hash(t * 53.7 + 3) - 0.5) * sh * 0.08;
  const panX = (p.pan || 0) * Math.sin(u * 0.25 + seg.index * 1.7) * 0.05;
  return { zoom: Math.max(1, zoom), angle, dx: dx + panX, dy };
}

async function renderView(src, cam, w, h) {
  let img = sharp(src.data, { raw: { width: src.W, height: src.H, channels: 3 } });
  let width = src.W, height = src.H, data = src.data;
  if (Math.abs(cam.angle) > 0.01) {
    const r = await img.rotate(cam.angle, { background: '#000' }).raw().toBuffer({ resolveWithObject: true });
    data = r.data; width = r.info.width; height = r.info.height;
  }
  const cw = Math.round(w / cam.zoom), ch = Math.round(h / cam.zoom);
  const maxL = width - cw, maxT = height - ch;
  const left = Math.max(0, Math.min(maxL, Math.round((width - cw) / 2 + cam.dx * w)));
  const top = Math.max(0, Math.min(maxT, Math.round((height - ch) / 2 + cam.dy * h)));
  return sharp(data, { raw: { width, height, channels: 3 } }).extract({ left, top, width: cw, height: ch }).resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
}

/**
 * segments: [{start, end, image(file)}] sortiert, lückenlos.
 * params: { zoomDrift, bassZoom, rotation, shake, pan, beatFlash, crossfade }
 */
export async function renderReactive({ segments, analysis, params, width, height, fps, audio, out, onProgress, checkCancel }) {
  const total = Math.ceil(analysis.duration * fps);
  const cache = new Map();
  const load = async (f) => { if (!cache.has(f)) cache.set(f, await prepare(f, width, height)); if (cache.size > 4) cache.delete(cache.keys().next().value); return cache.get(f); };
  segments.forEach((s, i) => { s.index = i; });
  const beats = analysis.beats || [];
  const writer = rawVideoWriter(out, { width, height, fps, audio });
  const BATCH = 6; let bi = 0;
  try {
    for (let f0 = 0; f0 < total; f0 += BATCH) {
      checkCancel?.();
      const jobs = [];
      for (let f = f0; f < Math.min(total, f0 + BATCH); f++) {
        const t = f / fps;
        let k = segments.findIndex((s) => t >= s.start && t < s.end); if (k < 0) k = segments.length - 1;
        const seg = segments[k], next = segments[k + 1];
        const xf = Math.min(params.crossfade || 0, (seg.end - seg.start) / 2);
        const alpha = next && xf > 0 && t > seg.end - xf ? (t - (seg.end - xf)) / xf : 0;
        while (bi < beats.length - 1 && beats[bi + 1] <= t) bi++;
        const sinceBeat = beats.length && beats[bi] <= t ? t - beats[bi] : 99;
        const flash = 1 + (params.beatFlash || 0) * Math.exp(-sinceBeat * 9) * (0.5 + envAt(analysis.bass, t));
        jobs.push((async () => {
          const a = await renderView(await load(seg.image), cameraAt(t, seg, analysis, params), width, height);
          let buf = a;
          if (alpha > 0) {
            const b = await renderView(await load(next.image), cameraAt(t, next, analysis, params), width, height);
            const s = alpha * alpha * (3 - 2 * alpha); // weiche Kurve
            buf = Buffer.allocUnsafe(a.length);
            for (let i = 0; i < a.length; i++) buf[i] = a[i] + (b[i] - a[i]) * s;
          }
          if (flash > 1.003) { if (buf === a) buf = Buffer.from(a); for (let i = 0; i < buf.length; i++) { const v = buf[i] * flash; buf[i] = v > 255 ? 255 : v; } }
          return buf;
        })());
      }
      for (const buf of await Promise.all(jobs)) await writer.write(buf);
      onProgress?.(Math.min(1, (f0 + BATCH) / total));
    }
    await writer.end();
  } catch (e) { writer.kill(); throw e; }
}
