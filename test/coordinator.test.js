const test = require('node:test');
const assert = require('node:assert/strict');

const { ExecutionLockManager, createActionLease, intentNeedsExecutor } = require('../src/coordinator/execution-lock');
const { getRoleMode, normalizeRoleMode, pickAgents } = require('../src/coordinator/roles');
const { decideTurnStatus } = require('../src/coordinator/turn-status');

test('normalizes current and legacy role modes', function() {
  assert.equal(normalizeRoleMode('openclaw-main'), 'openclaw-main');
  assert.equal(normalizeRoleMode('hermes-main'), 'hermes-main');
  assert.equal(normalizeRoleMode('oc-main'), 'openclaw-main');
  assert.equal(normalizeRoleMode('h-main'), 'hermes-main');
  assert.equal(normalizeRoleMode('free-chat'), 'openclaw-main');
  assert.equal(normalizeRoleMode('debate'), 'openclaw-main');
  assert.equal(normalizeRoleMode('mention-only'), 'openclaw-main');
  assert.equal(normalizeRoleMode('mention-first'), 'openclaw-main');
  assert.equal(normalizeRoleMode('unknown'), 'openclaw-main');
});

test('routes primary and secondary agents by role mode', function() {
  assert.deepEqual(pickAgents('openclaw-main'), { primary: 'oc', secondary: 'hm', executor: 'oc', reviewer: 'hm', roleMode: 'openclaw-main' });
  assert.deepEqual(pickAgents('hermes-main'), { primary: 'hm', secondary: 'oc', executor: 'hm', reviewer: 'oc', roleMode: 'hermes-main' });
  assert.deepEqual(pickAgents('free-chat'), { primary: 'oc', secondary: 'hm', executor: 'oc', reviewer: 'hm', roleMode: 'openclaw-main' });
  assert.deepEqual(pickAgents('debate'), { primary: 'oc', secondary: 'hm', executor: 'oc', reviewer: 'hm', roleMode: 'openclaw-main' });
  assert.deepEqual(pickAgents('mention-first'), { primary: 'oc', secondary: 'hm', executor: 'oc', reviewer: 'hm', roleMode: 'openclaw-main' });
});

test('explicit mentions change speaking order but not execution ownership', function() {
  assert.deepEqual(pickAgents('hermes-main', 'oc', 'casual'), { primary: 'oc', secondary: 'hm', executor: 'hm', reviewer: 'oc', roleMode: 'hermes-main' });
  assert.deepEqual(pickAgents('openclaw-main', 'hm', 'qa'), { primary: 'hm', secondary: 'oc', executor: 'oc', reviewer: 'hm', roleMode: 'openclaw-main' });
});

test('execution turns keep configured main executor even when the reviewer is mentioned first', function() {
  assert.deepEqual(pickAgents('hermes-main', 'oc', 'coding'), { primary: 'oc', secondary: 'hm', executor: 'hm', reviewer: 'oc', roleMode: 'hermes-main' });
  assert.deepEqual(pickAgents('openclaw-main', 'hm', 'risky'), { primary: 'hm', secondary: 'oc', executor: 'oc', reviewer: 'hm', roleMode: 'openclaw-main' });
});

test('role mode metadata keeps executor/reviewer swappable', function() {
  assert.equal(getRoleMode('openclaw-main').executor, 'oc');
  assert.equal(getRoleMode('openclaw-main').reviewer, 'hm');
  assert.equal(getRoleMode('hermes-main').executor, 'hm');
  assert.equal(getRoleMode('hermes-main').reviewer, 'oc');
  assert.equal(getRoleMode('free-chat').executor, 'oc');
  assert.equal(getRoleMode('mention-first').reviewer, 'hm');
});

test('turn status distinguishes done, partial, and error', function() {
  assert.equal(decideTurnStatus(1, 0), 'done');
  assert.equal(decideTurnStatus(1, 1), 'partial');
  assert.equal(decideTurnStatus(0, 1), 'error');
});

test('execution lock only applies to coding and risky intents', function() {
  assert.equal(intentNeedsExecutor('coding'), true);
  assert.equal(intentNeedsExecutor('risky'), true);
  assert.equal(intentNeedsExecutor('casual'), false);
  assert.equal(intentNeedsExecutor('planning'), false);
});

test('action lease records swappable executor scope and expiry', function() {
  const lease = createActionLease('hm', 'coding', 'please edit the README and run tests', {
    now: new Date('2026-05-19T10:00:00Z').getTime(),
    ttlMs: 60000,
    id: 'lease-test'
  });

  assert.equal(lease.id, 'lease-test');
  assert.equal(lease.owner, 'hm');
  assert.equal(lease.agent, 'hm');
  assert.equal(lease.intent, 'coding');
  assert.equal(lease.scope, 'please edit the README and run tests');
  assert.equal(lease.status, 'active');
  assert.equal(lease.expiresAt - lease.startedAt, 60000);
  assert.equal(createActionLease(null, 'coding', 'edit'), null);
  assert.equal(createActionLease('oc', 'casual', 'hello'), null);
});

test('action lease clamps unsafe ttl values', function() {
  const shortLease = createActionLease('oc', 'coding', 'edit', { now: 1000, ttlMs: 1, id: 'short' });
  const longLease = createActionLease('oc', 'coding', 'edit', { now: 1000, ttlMs: 60 * 60 * 1000, id: 'long' });

  assert.equal(shortLease.expiresAt - shortLease.startedAt, 30000);
  assert.equal(longLease.expiresAt - longLease.startedAt, 30 * 60 * 1000);
});

test('execution lock blocks competing executor turns until release', function() {
  const locks = new ExecutionLockManager(function(agent) {
    return agent === 'hm' ? 'Hermes' : 'OpenClaw';
  });

  assert.deepEqual(locks.acquire(null, 'casual', 'hello'), { ok: true, acquired: false });

  const first = locks.acquire('oc', 'coding', 'edit code');
  assert.equal(first.ok, true);
  assert.equal(first.acquired, true);
  assert.equal(first.lease.owner, 'oc');
  assert.equal(first.lease.scope, 'edit code');
  assert.equal(locks.current().agent, 'oc');
  assert.equal(locks.current().leaseId, first.lease.id);

  const second = locks.acquire('hm', 'coding', 'edit code too');
  assert.equal(second.ok, false);
  assert.match(second.error, /OpenClaw is already holding/);
  assert.equal(locks.current().agent, 'oc');

  locks.release('hm');
  assert.equal(locks.current().agent, 'oc');

  locks.release('oc');
  assert.equal(locks.current(), null);
});
