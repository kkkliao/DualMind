const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canExecuteIntent,
  executionBlockMessage,
  executionBlockReason,
  executionCapabilityFor
} = require('../src/coordinator/execution-capability');

test('execution capability allows non-execution intents without tools', function() {
  assert.equal(canExecuteIntent({}, 'casual'), true);
  assert.equal(canExecuteIntent({}, 'planning'), true);
});

test('execution capability blocks coding without file or command execution', function() {
  assert.equal(canExecuteIntent({ toolExecution: false }, 'coding'), false);
  assert.equal(canExecuteIntent({ toolExecution: true, canExecuteFiles: false, canRunCommands: false }, 'coding'), false);
});

test('execution capability allows coding with file or command execution', function() {
  assert.equal(canExecuteIntent({ toolExecution: true, canExecuteFiles: true }, 'coding'), true);
  assert.equal(canExecuteIntent({ toolExecution: true, canRunCommands: true }, 'risky'), true);
});

test('execution block message contains agent and redacted capability summary', function() {
  const block = executionBlockMessage('oc', { readOnlyMode: true }, 'coding');

  assert.equal(block.ok, false);
  assert.equal(block.status, 'blocked');
  assert.equal(block.reason, 'executor-capability-missing');
  assert.equal(block.agent, 'oc');
  assert.equal(block.capabilities.canExecuteFiles, false);
  assert.match(block.message, /OpenClaw/);
  assert.match(executionBlockReason('hm', {}, 'coding'), /Hermes/);
  assert.deepEqual(executionCapabilityFor({ canExecuteFiles: true, canRunCommands: false, canRestrictTools: true, toolExecution: true }), {
    canExecuteFiles: true,
    canRunCommands: false,
    canRestrictTools: true,
    toolExecution: true
  });
});
