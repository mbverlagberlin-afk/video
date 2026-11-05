import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScreenplayBasic } from '../src/ai/screenplay.js';

test('Regelbasierter Parser erkennt Szenen, Figuren und Dialoge', () => {
  const r = parseScreenplayBasic(`Title: Test
INT. KÜCHE - MORGEN

Anna steht am Fenster und trinkt Kaffee.

ANNA
(leise)
Es regnet schon wieder.

EXT. STRASSE - NACHT

Ein Auto fährt vorbei.

BEN
Warte auf mich!`);
  assert.equal(r.title, 'Test');
  assert.equal(r.scenes.length, 2);
  assert.equal(r.scenes[0].location, 'KÜCHE');
  assert.equal(r.scenes[0].timeOfDay, 'MORGEN');
  assert.deepEqual(r.characters.map((c) => c.name), ['ANNA', 'BEN']);
  const lines = r.scenes.flatMap((s) => s.shots).flatMap((s) => s.dialogue);
  assert.deepEqual(lines.map((l) => l.line), ['Es regnet schon wieder.', 'Warte auf mich!']);
});
