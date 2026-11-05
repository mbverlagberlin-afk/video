import { spawn } from 'node:child_process';

export function run(cmd, args, { input, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); onStderr?.(String(d)); });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} fehlgeschlagen (${code}): ${err.slice(-1500)}`)));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

export const ffmpeg = (args, opts) => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], opts);

export async function probeDuration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(String(out).trim()) || 0;
}

/** Startet ffmpeg als Pipe für Rohbilder (rgb24) – liefert {write, end}. */
export function rawVideoWriter(outFile, { width, height, fps, audio, audioOffset = 0 }) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-r', String(fps), '-i', '-'];
  if (audio) args.push('-ss', String(audioOffset), '-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile);
  const p = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.stdin.on('error', () => {}); // Fehler wird über "done" gemeldet
  const done = new Promise((res, rej) => { p.on('error', rej); p.on('close', (c) => c === 0 ? res() : rej(new Error('ffmpeg: ' + err.slice(-1500)))); });
  return {
    write(buf) { return p.stdin.write(buf) ? Promise.resolve() : new Promise((res) => p.stdin.once('drain', res)); },
    async end() { p.stdin.end(); await done; },
    kill() { p.kill('SIGKILL'); },
  };
}
