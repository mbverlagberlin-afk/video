// Audioanalyse für Musikvideos: Lautstärke-, Bass- und Höhenhüllkurven, Onsets, Tempo (BPM), Beats, Abschnitte.
import { run } from '../ffmpeg.js';

export const SR = 22050;
export const HOP_HZ = 50; // Hüllkurven-Auflösung: 50 Werte pro Sekunde

export async function decodeMono(file) {
  const buf = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-']);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

function onePoleLP(x, cutoff) {
  const a = Math.exp(-2 * Math.PI * cutoff / SR); const y = new Float32Array(x.length); let s = 0;
  for (let i = 0; i < x.length; i++) { s = (1 - a) * x[i] + a * s; y[i] = s; }
  return y;
}

function rmsEnvelope(x, hop) {
  const n = Math.floor(x.length / hop); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = i * hop; j < (i + 1) * hop; j++) s += x[j] * x[j]; out[i] = Math.sqrt(s / hop); }
  return out;
}

function normalize(env, pct = 0.98) {
  const sorted = Float32Array.from(env).sort();
  const ref = sorted[Math.floor(sorted.length * pct)] || 1e-9;
  return Array.from(env, (v) => Math.min(1, v / (ref || 1e-9)));
}

function smooth(env, k) {
  const out = new Array(env.length); let acc = 0; const q = [];
  for (let i = 0; i < env.length; i++) { q.push(env[i]); acc += env[i]; if (q.length > k) acc -= q.shift(); out[i] = acc / q.length; }
  return out;
}

export function analyzeSamples(x) {
  const hop = Math.round(SR / HOP_HZ);
  const duration = x.length / SR;
  const low = onePoleLP(onePoleLP(x, 150), 150);
  const lowmid = onePoleLP(x, 2000);
  const high = new Float32Array(x.length); for (let i = 0; i < x.length; i++) high[i] = x[i] - lowmid[i];
  const energyRaw = rmsEnvelope(x, hop), bassRaw = rmsEnvelope(low, hop), trebleRaw = rmsEnvelope(high, hop);

  // Onset-Stärke: positive Änderung der log. Energie in Bass- und Gesamtband
  const n = energyRaw.length; const onsetRaw = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const d1 = Math.log1p(1000 * bassRaw[i]) - Math.log1p(1000 * bassRaw[i - 1]);
    const d2 = Math.log1p(1000 * energyRaw[i]) - Math.log1p(1000 * energyRaw[i - 1]);
    const d3 = Math.log1p(1000 * trebleRaw[i]) - Math.log1p(1000 * trebleRaw[i - 1]);
    onsetRaw[i] = Math.max(0, d1) * 1.5 + Math.max(0, d2) + Math.max(0, d3) * 0.5;
  }
  // lokalen Mittelwert abziehen
  const om = smooth(Array.from(onsetRaw), 25);
  const onset = normalize(onsetRaw.map((v, i) => Math.max(0, v - om[i])), 0.99);

  const { bpm, beats } = trackBeats(onset, HOP_HZ);
  const energy = normalize(energyRaw), bass = normalize(bassRaw), treble = normalize(trebleRaw);
  const sections = findSections(energy, beats, duration);

  // Wellenform für die Oberfläche (max. 1500 Punkte)
  const points = Math.min(1500, n); const wave = [];
  for (let i = 0; i < points; i++) { const a = Math.floor(i * n / points), b = Math.max(a + 1, Math.floor((i + 1) * n / points)); let m = 0; for (let j = a; j < b; j++) m = Math.max(m, energy[j]); wave.push(+m.toFixed(3)); }

  const r3 = (arr) => arr.map((v) => +v.toFixed(3));
  return { duration, hopHz: HOP_HZ, bpm, beats: beats.map((b) => +b.toFixed(3)), sections, wave, energy: r3(energy), bass: r3(bass), treble: r3(treble), onset: r3(onset) };
}

export function trackBeats(onset, hz) {
  const n = onset.length;
  if (n < hz * 2) return { bpm: 0, beats: [] };
  let best = { score: -1, lag: hz / 2 };
  const minLag = Math.floor(hz * 60 / 190), maxLag = Math.ceil(hz * 60 / 60);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0; for (let i = lag; i < n; i++) s += onset[i] * onset[i - lag];
    s /= (n - lag);
    const bpm = 60 * hz / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2)); // Bevorzugung um 120 BPM
    if (s * w > best.score) best = { score: s * w, lag };
  }
  // Fein-Periode per parabolischer Interpolation
  const ac = (lag) => { let s = 0; for (let i = lag; i < n; i++) s += onset[i] * onset[i - lag]; return s / (n - lag); };
  const y0 = ac(best.lag - 1), y1 = ac(best.lag), y2 = ac(best.lag + 1);
  const delta = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  const period = best.lag + (Math.abs(delta) < 1 ? delta : 0);
  // Phase finden
  let bestPhase = 0, bestPs = -1;
  for (let ph = 0; ph < period; ph++) { let s = 0; for (let t = ph; t < n; t += period) s += onset[Math.round(t)] || 0; if (s > bestPs) { bestPs = s; bestPhase = ph; } }
  const beats = []; const win = Math.max(1, Math.round(period * 0.12));
  for (let t = bestPhase; t < n; t += period) {
    let bi = Math.round(t), bv = -1;
    for (let j = Math.max(0, Math.round(t) - win); j <= Math.min(n - 1, Math.round(t) + win); j++) if (onset[j] > bv) { bv = onset[j]; bi = j; }
    beats.push(bi / hz);
  }
  return { bpm: +(60 * hz / period).toFixed(1), beats };
}

/** Teilt den Song in Abschnitte (~8–20 s) an Takt-Grenzen mit deutlichen Energiewechseln. */
export function findSections(energy, beats, duration) {
  const hz = HOP_HZ; const sm = smooth(energy, hz * 2);
  const bars = beats.filter((_, i) => i % 4 === 0);
  const candidates = bars.length > 2 ? bars : Array.from({ length: Math.floor(duration / 4) }, (_, i) => i * 4);
  const cuts = [0];
  const minLen = Math.max(4, Math.min(8, duration / 6));
  for (const t of candidates) {
    const last = cuts[cuts.length - 1];
    if (t - last < minLen || duration - t < minLen * 0.75) continue;
    const i = Math.floor(t * hz);
    const before = sm[Math.max(0, i - hz)] ?? 0, after = sm[Math.min(sm.length - 1, i + hz * 2)] ?? 0;
    if (Math.abs(after - before) > 0.12 || t - last >= 20) cuts.push(t);
  }
  const out = cuts.map((start, k) => {
    const end = cuts[k + 1] ?? duration;
    const seg = energy.slice(Math.floor(start * hz), Math.floor(end * hz));
    const avg = seg.reduce((a, b) => a + b, 0) / Math.max(1, seg.length);
    return { start: +start.toFixed(3), end: +end.toFixed(3), energy: +avg.toFixed(3) };
  });
  const sorted = out.map((s) => s.energy).sort((a, b) => a - b);
  const hi = sorted[Math.floor(sorted.length * 0.66)] ?? 1, lo = sorted[Math.floor(sorted.length * 0.33)] ?? 0;
  for (const s of out) s.label = s.energy >= hi ? 'intensiv' : s.energy <= lo ? 'ruhig' : 'mittel';
  return out;
}

export async function analyzeAudio(file) {
  return analyzeSamples(await decodeMono(file));
}

/** Liest einen Hüllkurvenwert zum Zeitpunkt t (linear interpoliert). */
export function envAt(env, t, hz = HOP_HZ) {
  const x = t * hz; const i = Math.floor(x); const f = x - i;
  const a = env[Math.max(0, Math.min(env.length - 1, i))] ?? 0, b = env[Math.max(0, Math.min(env.length - 1, i + 1))] ?? 0;
  return a + (b - a) * f;
}
