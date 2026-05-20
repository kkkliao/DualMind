const test = require('node:test');
const assert = require('node:assert/strict');

const { decideRemoteMessagePolicy } = require('../src/coordinator/remote-policy');

test('remote ordinary messages are queued for web continuation', function() {
  const policy = decideRemoteMessagePolicy({}, 'casual');

  assert.equal(policy.queue, true);
  assert.equal(policy.mayExecute, false);
  assert.equal(policy.requiresWebConfirmation, false);
  assert.match(policy.response, /continue/);
});

test('remote coding and risky messages require web confirmation by default', function() {
  const coding = decideRemoteMessagePolicy({}, 'coding');
  const risky = decideRemoteMessagePolicy({}, 'risky');

  assert.equal(coding.queue, true);
  assert.equal(coding.mayExecute, false);
  assert.equal(coding.requiresWebConfirmation, true);
  assert.match(coding.response, /confirm/);
  assert.equal(risky.requiresWebConfirmation, true);
});

test('remote execution can only be enabled explicitly', function() {
  const policy = decideRemoteMessagePolicy({ safety: { allowRemoteCodeExecution: true } }, 'coding');

  assert.equal(policy.queue, true);
  assert.equal(policy.mayExecute, true);
  assert.equal(policy.requiresWebConfirmation, false);
  assert.match(policy.response, /supervise/);
});
