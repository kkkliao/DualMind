const test = require('node:test');
const assert = require('node:assert/strict');

const { sse, writeDone } = require('../src/streaming/sse-writer');
const { streamText, waitForMinThinking } = require('../src/streaming/simulated-stream');

function memoryResponse() {
  return {
    chunks: [],
    write(value) {
      this.chunks.push(value);
    }
  };
}

test('sse writer serializes events and done marker', function() {
  const res = memoryResponse();
  sse(res, { t: 'hello', value: 1 });
  writeDone(res);

  assert.equal(res.chunks[0], 'data: {"t":"hello","value":1}\n\n');
  assert.equal(res.chunks[1], 'data: [DONE]\n\n');
});

test('simulated stream chunks text and marks final frame', async function() {
  const res = memoryResponse();
  await streamText(res, 'oc', 'abcdefghijklmnopqr', true, { chunkSize: 8, delayMs: 0 });

  assert.equal(res.chunks.length, 4);
  assert.match(res.chunks[0], /"d":"abcdefgh"/);
  assert.match(res.chunks[2], /"d":"qr"/);
  assert.match(res.chunks[3], /"f":true/);
});

test('minimum thinking delay can be disabled for tests', async function() {
  const startedAt = Date.now();
  await waitForMinThinking(startedAt, { collaboration: { minThinkingMs: 0 } });
  assert.equal(Date.now() - startedAt < 200, true);
});
