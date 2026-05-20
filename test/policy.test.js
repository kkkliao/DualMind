const test = require('node:test');
const assert = require('node:assert/strict');

const { detectExecutionClaims, policyWarningForReply } = require('../src/coordinator/policy');

test('detects execution claims in English and Chinese', function() {
  assert.equal(detectExecutionClaims('I edited the file.').length >= 1, true);
  assert.equal(detectExecutionClaims('I ran tests.').length >= 1, true);
  assert.equal(detectExecutionClaims('我已经修改了配置。').length >= 1, true);
  assert.equal(detectExecutionClaims('我运行了测试。').length >= 1, true);
  assert.equal(detectExecutionClaims('等我拿到执行权，秒写秒放到桌面。').length >= 1, true);
  assert.equal(detectExecutionClaims('我这边先把代码框架拉好。').length >= 1, true);
  assert.equal(detectExecutionClaims('Once I get execution permission I will save it to disk.').length >= 1, true);
  assert.equal(detectExecutionClaims('I suggest the executor edits the file next.').length, 0);
  assert.equal(detectExecutionClaims('我建议执行者修改这个文件。').length, 0);
});

test('warns when a non-executor claims action or future execution rights', function() {
  const warning = policyWarningForReply({
    agent: 'hm',
    executor: 'oc',
    intent: 'coding',
    text: 'I edited the file.'
  });

  assert.equal(warning.agent, 'hm');
  assert.equal(warning.executor, 'oc');
  assert.equal(warning.reason, 'non-executor-claimed-action');
  assert.equal(warning.claims.length, 1);
  assert.equal(policyWarningForReply({ agent: 'oc', executor: 'oc', intent: 'coding', text: 'I edited the file.' }), null);
  assert.equal(policyWarningForReply({ agent: 'hm', executor: 'oc', intent: 'casual', text: '等我拿到执行权，秒写秒放到桌面。' }).reason, 'non-executor-claimed-action');
});
