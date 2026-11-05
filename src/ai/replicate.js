// Minimaler Replicate-Client (https://replicate.com) für Bild- und Videomodelle.
import fs from 'node:fs';
import path from 'node:path';
import { getSettings } from '../config.js';

const API = 'https://api.replicate.com/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function headers(extra = {}) {
  const token = getSettings().replicateApiToken;
  if (!token) throw new Error('Kein Replicate-API-Token hinterlegt (Einstellungen).');
  return { Authorization: `Bearer ${token}`, ...extra };
}

const HINTS = {
  401: 'Replicate: Der API-Token ist ungültig. Bitte unter Einstellungen einen gültigen Token eintragen.',
  402: 'Replicate: Kein Guthaben mehr. Bitte unter replicate.com/account/billing Guthaben aufladen und danach ein paar Minuten warten.',
  404: 'Replicate: Das eingestellte Modell wurde nicht gefunden. Bitte den Modellnamen unter Einstellungen prüfen.',
  422: 'Replicate: Das Modell hat die Eingaben abgelehnt. Bitte den Prompt oder den Modellnamen prüfen.',
  429: 'Replicate: Zu viele Anfragen auf einmal. Bitte kurz warten und erneut versuchen.',
};

async function check(res) {
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(HINTS[res.status] ? `${HINTS[res.status]} (Code ${res.status})` : `Replicate ${res.status}: ${body}`);
  }
  return res.json();
}

/** Lädt eine lokale Datei zu Replicate hoch und liefert eine URL, die als Modell-Eingabe dient. */
export async function uploadFile(file) {
  const form = new FormData();
  const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
  form.append('content', new Blob([fs.readFileSync(file)], { type }), path.basename(file));
  const data = await check(await fetch(`${API}/files`, { method: 'POST', headers: headers(), body: form }));
  return data.urls.get;
}

/** Startet ein Modell ("owner/name" oder "owner/name:version") und wartet auf das Ergebnis. */
export async function runModel(model, input, { log = () => {}, timeoutMs = 15 * 60 * 1000 } = {}) {
  const [ref, version] = model.split(':');
  const url = version ? `${API}/predictions` : `${API}/models/${ref}/predictions`;
  const body = version ? { version, input } : { input };
  let pred = await check(await fetch(url, { method: 'POST', headers: headers({ 'Content-Type': 'application/json', Prefer: 'wait=60' }), body: JSON.stringify(body) }));
  const start = Date.now();
  while (!['succeeded', 'failed', 'canceled'].includes(pred.status)) {
    if (Date.now() - start > timeoutMs) throw new Error('Zeitüberschreitung bei Replicate');
    await sleep(3000);
    pred = await check(await fetch(pred.urls.get, { headers: headers() }));
    log(`Replicate: ${pred.status}`);
  }
  if (pred.status !== 'succeeded') throw new Error(`Replicate-Modell fehlgeschlagen: ${pred.error || pred.status}`);
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (typeof out !== 'string') throw new Error('Unerwartete Ausgabe von Replicate: ' + JSON.stringify(pred.output).slice(0, 200));
  return out;
}

export async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
