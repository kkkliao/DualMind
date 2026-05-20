const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { TurnStore, dateKey } = require('../src/store/turn-store');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dualmind-turns-'));
}

test('dateKey returns stable yyyy-mm-dd keys', function() {
  assert.equal(dateKey(new Date(2026, 4, 19, 1, 2, 3)), '2026-05-19');
});

test('turn store creates, updates, finishes, lists, and gets turns', function() {
  const dir = tmpDir();
  const store = new TurnStore(dir);

  const turn = store.create({
    id: 'turn-test',
    now: new Date('2026-05-19T00:00:00Z').getTime(),
    roleMode: 'hermes-main',
    intent: 'coding',
    mentioned: 'hm',
    executor: 'hm',
    primary: 'hm',
    secondary: null,
    source: 'wechat',
    remoteUser: 'wx-user',
    lockAcquired: true,
    actionLease: { id: 'lease-test', owner: 'hm', agent: 'hm', intent: 'coding', scope: '@Hermes implement this', status: 'active' },
    userMessage: '@Hermes implement this'
  });

  assert.equal(turn.id, 'turn-test');
  assert.equal(turn.status, 'running');
  assert.equal(turn.source, 'wechat');
  assert.equal(turn.remoteUser, 'wx-user');
  assert.equal(turn.actionLease.owner, 'hm');

  store.addMessage(turn.id, { type: 'user', agent: 'user', content: '@Hermes implement this' });
  store.addMessage(turn.id, { type: 'agent', agent: 'hm', content: 'ok' });
  store.addEvent(turn.id, { type: 'think', agent: 'hm' });
  store.setAgentState(turn.id, 'hm', 'thinking', { label: 'Hermes is responding...' });
  store.setAgentState(turn.id, 'hm', 'done', { streamingMode: 'simulated' });
  store.addPolicyWarning(turn.id, { agent: 'oc', executor: 'hm', reason: 'non-executor-claimed-action', claims: [{ text: 'I edited' }] });
  store.updateActionLease(turn.id, { status: 'released', releasedAt: new Date('2026-05-19T00:01:00Z').getTime() });
  store.finish(turn.id, 'done', { responseCount: 1 });

  const loaded = store.get(turn.id);
  assert.equal(loaded.status, 'done');
  assert.equal(loaded.responseCount, 1);
  assert.equal(loaded.actionLease.status, 'released');
  assert.equal(loaded.policyWarnings.length, 1);
  assert.equal(loaded.agentStates.hm.state, 'done');
  assert.equal(loaded.agentStates.hm.streamingMode, 'simulated');
  assert.equal(loaded.messages.length, 2);
  assert.equal(loaded.events.length, 2);

  const listed = store.list(10);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'turn-test');
  assert.equal(store.list(10, { status: 'done' }).length, 1);
  assert.equal(store.list(10, { status: 'queued' }).length, 0);
  assert.equal(store.list(10, { source: 'wechat' }).length, 1);
  assert.equal(store.list(10, { intent: 'coding' }).length, 1);
  assert.equal(store.list(10, { executor: 'hm' }).length, 1);
});
