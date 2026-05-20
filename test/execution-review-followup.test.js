const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldRunExecutorReviewFollowUp } = require('../server');

test('execution review follow-up only runs for successful execution turns with reviewer feedback', function() {
  const route = { primary: 'oc', secondary: 'hm' };
  const primary = { ok: true, reply: 'I changed the code.' };
  const secondary = { ok: true, reply: 'Hermes: consider adding a test.' };

  assert.equal(shouldRunExecutorReviewFollowUp('coding', route, primary, secondary, []), true);
  assert.equal(shouldRunExecutorReviewFollowUp('risky', route, primary, secondary, []), true);
  assert.equal(shouldRunExecutorReviewFollowUp('casual', route, primary, secondary, []), false);
  assert.equal(shouldRunExecutorReviewFollowUp('coding', { primary: 'oc' }, primary, secondary, []), false);
  assert.equal(shouldRunExecutorReviewFollowUp('coding', route, { ok: false }, secondary, []), false);
  assert.equal(shouldRunExecutorReviewFollowUp('coding', route, primary, { ok: true, reply: '' }, []), false);
  assert.equal(shouldRunExecutorReviewFollowUp('coding', route, primary, secondary, [{ agent: 'hm', error: 'quota' }]), false);
});
