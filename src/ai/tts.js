// Sprachausgabe für Dialoge: ElevenLabs oder Demo (eingebautes flite in ffmpeg).
import fs from 'node:fs';
import { getSettings } from '../config.js';
import { ffmpeg } from '../ffmpeg.js';

export async function listVoices() {
  const s = getSettings();
  if (s.ttsProvider !== 'elevenlabs' || !s.elevenlabsApiKey) return DEMO_VOICES;
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': s.elevenlabsApiKey } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.voices.map((v) => ({ id: v.voice_id, name: v.name, description: [v.labels?.gender, v.labels?.age, v.labels?.accent, v.labels?.description].filter(Boolean).join(', ') }));
}

const DEMO_VOICES = [
  { id: 'kal', name: 'Demo: Kal (männlich)', description: 'flite' },
  { id: 'slt', name: 'Demo: SLT (weiblich)', description: 'flite' },
  { id: 'awb', name: 'Demo: AWB (männlich, schottisch)', description: 'flite' },
  { id: 'rms', name: 'Demo: RMS (männlich, tief)', description: 'flite' },
];

/** Erzeugt eine WAV-Datei (48 kHz stereo) mit der gesprochenen Zeile. */
export async function speak({ text, voiceId, dest }) {
  const s = getSettings();
  if (s.ttsProvider === 'elevenlabs') {
    if (!s.elevenlabsApiKey) throw new Error('Kein ElevenLabs-API-Schlüssel hinterlegt.');
    if (!voiceId || DEMO_VOICES.some((v) => v.id === voiceId)) throw new Error('Bitte jeder Figur eine ElevenLabs-Stimme zuweisen.');
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': s.elevenlabsApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: s.elevenlabsModel }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    fs.writeFileSync(dest + '.mp3', Buffer.from(await res.arrayBuffer()));
    await ffmpeg(['-i', dest + '.mp3', '-ar', '48000', '-ac', '2', dest]);
    fs.rmSync(dest + '.mp3', { force: true });
    return dest;
  }
  const voice = DEMO_VOICES.some((v) => v.id === voiceId) ? voiceId : 'kal';
  const txt = dest + '.txt';
  fs.writeFileSync(txt, text);
  await ffmpeg(['-f', 'lavfi', '-i', `flite=textfile='${txt.replace(/'/g, "\\'")}':voice=${voice}`, '-ar', '48000', '-ac', '2', dest]);
  fs.rmSync(txt, { force: true });
  return dest;
}
