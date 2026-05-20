const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { TaskStore, makeTaskId } = require('../src/store/task-store');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dualmind-tasks-'));
}

test('makeTaskId creates task-prefixed ids', function() {
  assert.match(makeTaskId(12345), /^task-/);
});

test('task store creates, updates, finishes, gets, and filters tasks', function() {
  const store = new TaskStore(tmpDir());
  const task = store.create({
    id: 'task-test',
    now: new Date('2026-05-19T00:00:00Z').getTime(),
    turnId: 'turn-test',
    status: 'leased',
    intent: 'coding',
    executor: 'hm',
    reviewer: 'oc',
    roleMode: 'hermes-main',
    source: 'web',
    userMessage: 'edit code',
    leaseId: 'lease-test',
    capabilities: { canExecuteFiles: true, canRunCommands: true }
  });

  assert.equal(task.id, 'task-test');
  assert.equal(task.status, 'leased');
  assert.equal(task.executor, 'hm');
  assert.equal(task.reviewer, 'oc');

  store.addEvent(task.id, { type: 'started' });
  store.finish(task.id, 'done', { responseCount: 2 });

  const loaded = store.get(task.id);
  assert.equal(loaded.status, 'done');
  assert.equal(loaded.responseCount, 2);
  assert.equal(loaded.events.length, 1);
  assert.equal(store.list(10).length, 1);
  assert.equal(store.list(10, { status: 'done' }).length, 1);
  assert.equal(store.list(10, { executor: 'hm' }).length, 1);
  assert.equal(store.list(10, { source: 'wechat' }).length, 0);
});
