const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeCapabilities } = require('../src/agents/adapter-contract');

test('adapter capabilities default to simulated streaming', function() {
  const caps = normalizeCapabilities({});

  assert.equal(caps.canChat, true);
  assert.equal(caps.canPlan, true);
  assert.equal(caps.canExecuteFiles, false);
  assert.equal(caps.canRunCommands, false);
  assert.equal(caps.toolExecution, false);
  assert.equal(caps.trueStreaming, false);
  assert.equal(caps.simulatedStreaming, true);
  assert.equal(caps.streamingMode, 'simulated');
});

test('adapter capabilities promote true streaming explicitly', function() {
  const caps = normalizeCapabilities({ trueStreaming: true, gateway: true });

  assert.equal(caps.trueStreaming, true);
  assert.equal(caps.simulatedStreaming, false);
  assert.equal(caps.streamingMode, 'true-stream');
  assert.equal(caps.gateway, true);
  assert.equal(caps.canStreamTokens, true);
});

test('adapter capabilities infer tool execution from file or command execution', function() {
  const caps = normalizeCapabilities({ canExecuteFiles: true });

  assert.equal(caps.toolExecution, true);
  assert.equal(caps.canExecuteFiles, true);
  assert.equal(caps.canRunCommands, false);
});

test('legacy toolExecution enables file and command execution by default', function() {
  const caps = normalizeCapabilities({ toolExecution: true });

  assert.equal(caps.toolExecution, true);
  assert.equal(caps.canExecuteFiles, true);
  assert.equal(caps.canRunCommands, true);
});
