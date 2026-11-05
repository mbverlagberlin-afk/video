// Bild-zu-Video: Replicate (Kling, Wan, Minimax, …) oder Demo (Kamerafahrt per ffmpeg).
import fs from 'node:fs';
import { getSettings } from '../config.js';
import { runModel, uploadFile, download } from './replicate.js';
import { ffmpeg } from '../ffmpeg.js';

// Bekannte Modelle: Name des Bild-Eingabefelds und unterstützte Dauern.
const PRESETS = {
  'kwaivgi/kling-v2.1': { imageKey: 'start_image', durations: [5, 10] },
  'kwaivgi/kling-v2.5-turbo-pro': { imageKey: 'start_image', durations: [5, 10] },
  'wan-video/wan-2.2-i2v-fast': { imageKey: 'image', durations: null },
  'minimax/video-01': { imageKey: 'first_frame_image', durations: null },
  'minimax/hailuo-02': { imageKey: 'first_frame_image', durations: [6, 10] },
  'bytedance/seedance-1-pro': { imageKey: 'image', durations: [5, 10] },
};

export async function imageToVideo({ image, prompt, duration, dest, motion = 'auto', log }) {
  const s = getSettings();
  if (s.videoProvider === 'replicate') {
    const preset = PRESETS[s.videoModel.split(':')[0]] || {};
    const imageKey = s.videoImageKey || preset.imageKey || 'image';
    const input = { prompt, [imageKey]: await uploadFile(image) };
    if (preset.durations) input.duration = preset.durations.reduce((a, b) => (Math.abs(b - duration) < Math.abs(a - duration) ? b : a));
    const url = await runModel(s.videoModel, input, { log });
    await download(url, dest);
    return dest;
  }
  return kenBurns(image, dest, duration, s, motion, prompt);
}

/** Demo/Fallback: animierte Kamerafahrt über ein Standbild. */
export async function kenBurns(image, dest, duration, s, motion = 'auto', seedText = '') {
  const frames = Math.max(1, Math.round(duration * s.fps));
  const kinds = ['in', 'out', 'left', 'right'];
  const kind = motion === 'auto' ? kinds[[...seedText].reduce((a, c) => a + c.charCodeAt(0), 0) % kinds.length] : motion;
  const z = { in: `1+0.18*on/${frames}`, out: `1.18-0.18*on/${frames}`, left: '1.15', right: '1.15' }[kind];
  const x = { in: 'iw/2-(iw/zoom/2)', out: 'iw/2-(iw/zoom/2)', left: `(iw-iw/zoom)*(1-on/${frames})`, right: `(iw-iw/zoom)*on/${frames}` }[kind];
  await ffmpeg(['-loop', '1', '-i', image, '-vf',
    `scale=${s.width * 2}:${s.height * 2},zoompan=z='${z}':x='${x}':y='ih/2-(ih/zoom/2)':d=${frames}:s=${s.width}x${s.height}:fps=${s.fps},format=yuv420p`,
    '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', dest]);
  if (!fs.existsSync(dest)) throw new Error('Clip konnte nicht erzeugt werden');
  return dest;
}
