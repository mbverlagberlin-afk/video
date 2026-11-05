// Claude-Anbindung für strukturierte JSON-Antworten.
import Anthropic from '@anthropic-ai/sdk';
import { getSettings } from '../config.js';

export function claudeAvailable() {
  const s = getSettings();
  return s.llmProvider === 'claude' && !!s.anthropicApiKey;
}

/** Fragt Claude und erzwingt eine JSON-Antwort gemäß Schema. */
export async function claudeJSON({ system, prompt, schema, effort = 'medium' }) {
  const s = getSettings();
  const client = new Anthropic({ apiKey: s.anthropicApiKey });
  const stream = client.beta.messages.stream({
    model: s.claudeModel || 'claude-opus-5-5',
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // bei einer Ablehnung übernimmt automatisch ein Ersatzmodell
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude hat die Anfrage abgelehnt: ' + (msg.stop_details?.explanation || 'ohne Begründung'));
  if (msg.stop_reason === 'max_tokens') throw new Error('Antwort von Claude wurde abgeschnitten (Drehbuch zu lang?).');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}
