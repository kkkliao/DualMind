const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanAgentOutput, extractTextFromJson, parseJsonOutput, runCli } = require('../src/utils/cli');

test('extracts OpenClaw visible payload text without metadata', function() {
  const raw = {
    runId: 'abc',
    status: 'ok',
    result: {
      payloads: [{ text: 'visible reply', mediaUrl: null }],
      meta: {
        provider: 'example-provider',
        model: 'example-model',
        systemPromptReport: { chars: 1234 }
      },
      finalPromptText: 'private prompt'
    }
  };

  assert.equal(extractTextFromJson(raw), 'visible reply');
  assert.equal(cleanAgentOutput(JSON.stringify(raw)), 'visible reply');
});

test('extracts common LLM JSON shapes', function() {
  assert.equal(extractTextFromJson({ outputs: [{ text: 'from outputs' }] }), 'from outputs');
  assert.equal(extractTextFromJson({ choices: [{ message: { content: 'from choice' } }] }), 'from choice');
  assert.equal(extractTextFromJson({ finalAssistantVisibleText: 'from final' }), 'from final');
});

test('does not fall back to raw JSON when no visible text is known', function() {
  const raw = JSON.stringify({ runId: 'abc', result: { meta: { provider: 'secretish' } } });
  assert.equal(cleanAgentOutput(raw), '');
});

test('parses the last JSON line when CLI adds logs before JSON', function() {
  const parsed = parseJsonOutput('starting...\n{"reply":"ok"}\n');
  assert.deepEqual(parsed, { reply: 'ok' });
});

test('runCli exposes incremental stdout callbacks', async function() {
  let collected = '';
  const result = await runCli(process.execPath, ['-e', "process.stdout.write('a'); setTimeout(function(){ process.stdout.write('b'); }, 10);"], {
    onStdout(chunk) {
      collected += chunk;
    },
    timeoutMs: 5000
  });

  assert.equal(result.ok, true);
  assert.equal(result.stdout, 'ab');
  assert.equal(collected, 'ab');
});
