import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSamples, SR } from '../src/audio/analyze.js';

test('Beat-Erkennung findet das Tempo eines synthetischen 120-BPM-Kicks', () => {
  const dur = 20, x = new Float32Array(dur * SR), period = 0.5;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, u = t % period;
    x[i] = 0.9 * Math.sin(2 * Math.PI * 60 * u) * Math.exp(-u * 12) + 0.05 * Math.sin(2 * Math.PI * 440 * t);
  }
  const a = analyzeSamples(x);
  assert.ok(Math.abs(a.bpm - 120) < 3, `BPM ${a.bpm}`);
  assert.ok(Math.abs(a.beats.length - 40) <= 2, `Beats ${a.beats.length}`);
  assert.ok(a.beats.every((b) => Math.abs(((b + 0.25) % 0.5) - 0.25) < 0.05), 'Beats liegen auf dem Raster');
  assert.equal(Math.round(a.duration), dur);
});
