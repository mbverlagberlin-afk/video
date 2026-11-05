// Bildgenerierung: Replicate (z. B. FLUX) oder Offline-Demo (prozedurale Platzhalterbilder).
import crypto from 'node:crypto';
import sharp from 'sharp';
import { getSettings } from '../config.js';
import { runModel, download } from './replicate.js';

function aspect(w, h) {
  const r = w / h;
  const options = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '21:9': 21 / 9 };
  return Object.entries(options).sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0][0];
}

export async function generateImage({ prompt, negative, seed, dest, log, caption }) {
  const s = getSettings();
  if (s.imageProvider === 'replicate') {
    const input = { prompt, aspect_ratio: aspect(s.width, s.height), output_format: 'png', safety_tolerance: 5 };
    if (seed != null) input.seed = seed;
    if (negative) input.negative_prompt = negative;
    const url = await runModel(s.imageModel, input, { log });
    await download(url, dest + '.dl');
    await sharp(dest + '.dl').resize(s.width, s.height, { fit: 'cover' }).png().toFile(dest);
    (await import('node:fs')).rmSync(dest + '.dl', { force: true });
    return dest;
  }
  return demoImage(caption || prompt, dest, s.width, s.height, seed, prompt);
}

// ---------- Demo-Bilder: farbige, deterministische Szenen aus dem Prompt ----------
function rng(seedStr) {
  let h = crypto.createHash('sha256').update(seedStr).digest().readUInt32LE(0);
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
const esc = (t) => t.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export async function demoImage(prompt, dest, w, h, seed = 0, fullPrompt = prompt) {
  const r = rng(fullPrompt + seed);
  const hue = Math.floor(r() * 360);
  const night = /night|nacht|dark|dunkel/i.test(fullPrompt);
  const c1 = `hsl(${hue},${night ? 40 : 70}%,${night ? 12 : 55}%)`;
  const c2 = `hsl(${(hue + 40 + r() * 80) % 360},${night ? 50 : 80}%,${night ? 25 : 75}%)`;
  let shapes = '';
  for (let i = 0; i < 14; i++) {
    const x = r() * w, y = r() * h * 0.7, rad = 20 + r() * h * 0.25;
    shapes += `<circle cx="${x}" cy="${y}" r="${rad}" fill="hsl(${(hue + r() * 120) % 360},80%,${60 + r() * 30}%)" opacity="${0.08 + r() * 0.25}"/>`;
  }
  let mountain = `M0 ${h} `;
  for (let x = 0; x <= w; x += w / 12) mountain += `L${x} ${h * (0.55 + r() * 0.25)} `;
  mountain += `L${w} ${h} Z`;
  const words = prompt.split(/\s+/); const lines = []; let cur = '';
  for (const wd of words) { if ((cur + ' ' + wd).length > 60) { lines.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); if (lines.length >= 3) break; }
  if (cur && lines.length < 3) lines.push(cur);
  const text = lines.map((l, i) => `<text x="${w * 0.05}" y="${h * 0.86 + i * h * 0.045}" font-family="DejaVu Sans, sans-serif" font-size="${h * 0.032}" fill="#fff" opacity="0.92">${esc(l)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
  <radialGradient id="v" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>${shapes}
  <circle cx="${w * (0.2 + r() * 0.6)}" cy="${h * 0.3}" r="${h * 0.09}" fill="${night ? '#eef' : '#fff6d0'}" opacity="0.85"/>
  <path d="${mountain}" fill="hsl(${hue},30%,${night ? 6 : 22}%)" opacity="0.9"/>
  <rect width="100%" height="100%" fill="url(#v)"/>
  <rect x="0" y="${h * 0.8}" width="${w}" height="${h * 0.2}" fill="#000" opacity="0.35"/>${text}
  <text x="${w * 0.95}" y="${h * 0.07}" text-anchor="end" font-family="DejaVu Sans" font-size="${h * 0.025}" fill="#fff" opacity="0.6">DEMO</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(dest);
  return dest;
}
