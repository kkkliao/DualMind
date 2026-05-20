const test = require('node:test');
const assert = require('node:assert/strict');

const OpenClawAdapter = require('../src/agents/openclaw-adapter');
const HermesAdapter = require('../src/agents/hermes-adapter');

test('OpenClaw reviewer calls use infer instead of agent execution mode', async function() {
  const adapter = new OpenClawAdapter({ binPath: '/bin/echo', mode: 'agent' });
  const result = await adapter.reply({ prompt: 'review only', reviewOnly: true, timeoutMs: 1000 });

  assert.equal(result.ok, true);
  assert.match(result.raw, /infer model run/);
  assert.doesNotMatch(result.raw, /agent --json/);
});

test('Hermes reviewer calls restrict to safe toolset and one turn', async function() {
  const adapter = new HermesAdapter({ binPath: '/bin/echo' });
  const result = await adapter.reply({ prompt: 'review only', reviewOnly: true, timeoutMs: 1000 });

  assert.equal(result.ok, true);
  assert.match(result.raw, /--toolsets safe/);
  assert.match(result.raw, /--max-turns 1/);
});
