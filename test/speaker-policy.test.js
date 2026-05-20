const test = require('node:test');
const assert = require('node:assert/strict');

const {
  boundedBudget,
  buildAgentPrompt,
  debateBudget,
  detectMention,
  executionHolder,
  executionInstruction,
  roleForAgent,
  turnTranscriptText
} = require('../src/coordinator/speaker-policy');

test('speaker policy detects explicit mentions and request overrides', function() {
  assert.equal(detectMention('hi @OpenClaw', null), 'oc');
  assert.equal(detectMention('hi @Hermes', null), 'hm');
  assert.equal(detectMention('@OpenClaw and @Hermes both answer', null), null);
  assert.equal(detectMention('plain text', 'hm'), 'hm');
});

test('speaker policy assigns execution holder from mention or swappable role mode', function() {
  assert.equal(executionHolder({ roleMode: 'openclaw-main' }, null, 'coding'), 'oc');
  assert.equal(executionHolder({ roleMode: 'hermes-main' }, null, 'coding'), 'hm');
  assert.equal(executionHolder({ roleMode: 'openclaw-main' }, 'hm', 'coding'), 'oc');
  assert.equal(executionHolder({ roleMode: 'free-chat' }, null, 'casual'), 'oc');
});

test('speaker policy separates executor and reviewer roles', function() {
  var route = { roleMode: 'hermes-main' };

  assert.equal(roleForAgent('hm', route, null, 'coding'), 'executor/participant');
  assert.equal(roleForAgent('oc', route, null, 'coding'), 'reviewer/calibrator');
  assert.equal(roleForAgent('oc', { roleMode: 'openclaw-main' }, null, 'debate'), 'executor/participant');
  assert.equal(roleForAgent('oc', { roleMode: 'free-chat' }, null, 'casual'), 'executor/participant');
  assert.equal(roleForAgent('hm', { roleMode: 'free-chat' }, null, 'casual'), 'supporting participant');
});

test('speaker policy clamps debate budgets', function() {
  assert.equal(boundedBudget(2, 6, 4, 12), 4);
  assert.equal(boundedBudget(99, 6, 4, 12), 12);
  assert.equal(debateBudget({ collaboration: { negotiationMessageBudget: 10 } }, { roleMode: 'openclaw-main' }, 'debate'), 10);
  assert.equal(debateBudget({ collaboration: { negotiationMessageBudget: 2 } }, { roleMode: 'openclaw-main' }, 'debate'), 4);
  assert.equal(debateBudget({}, { roleMode: 'openclaw-main' }, 'casual'), 0);
});

test('speaker policy creates safe execution instructions', function() {
  var reviewerInstruction = executionInstruction('hm', { roleMode: 'openclaw-main' }, null, 'coding');
  var executorInstruction = executionInstruction('oc', { roleMode: 'openclaw-main', secondary: 'hm' }, null, 'coding');

  assert.match(reviewerInstruction, /OpenClaw holds execution permission/);
  assert.match(reviewerInstruction, /tell OpenClaw what to change/);
  assert.match(executorInstruction, /You hold execution permission/);
  assert.match(executorInstruction, /Do not delegate file edits, command execution, or code updates to Hermes/);
  assert.match(executionInstruction('oc', { roleMode: 'free-chat' }, null, 'casual'), /standing execution holder/);
  assert.match(executionInstruction('hm', { roleMode: 'free-chat' }, null, 'casual'), /do not claim to run commands, edit files, write code to disk, save files, or wait for execution permission/);
});

test('speaker policy formats transcript and prompt context', function() {
  assert.equal(turnTranscriptText([{ agent: 'oc', text: 'one' }, { agent: 'hm', text: 'two' }]), 'OpenClaw: one\nHermes: two');

  var prompt = buildAgentPrompt('hm', 'base prompt', {
    roleMode: 'hermes-main',
    role: 'executor/participant',
    executor: 'hm',
    context: 'User: hello',
    userMsg: 'please help',
    instruction: 'Reply now.'
  });

  assert.match(prompt, /base prompt/);
  assert.match(prompt, /Current role mode: hermes-main/);
  assert.match(prompt, /Current execution holder: Hermes/);
  assert.match(prompt, /Say "user", not a private person name/);
});
