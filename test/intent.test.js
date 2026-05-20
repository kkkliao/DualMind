const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyIntent, classifyIntentDetails, discussionPlanFor, requiresRiskConfirmation } = require('../src/coordinator/intent');

test('classifies risky actions before coding actions', function() {
  assert.equal(classifyIntent('请删除这个文件'), 'risky');
  assert.equal(classifyIntent('rm -rf temp'), 'risky');
  assert.equal(classifyIntent('reset config'), 'risky');
  assert.equal(classifyIntent('帮我修改代码'), 'coding');
});

test('requires explicit confirmation for risky actions by default', function() {
  assert.equal(requiresRiskConfirmation({}, 'risky', false), true);
  assert.equal(requiresRiskConfirmation({}, 'risky', true), false);
  assert.equal(requiresRiskConfirmation({ safety: { confirmRisky: false } }, 'risky', false), false);
  assert.equal(requiresRiskConfirmation({}, 'coding', false), false);
});

test('intent details preserve execution, debate, and planning dimensions', function() {
  const details = classifyIntentDetails('你们俩讨论一下这个代码架构并修改实现');

  assert.equal(details.intent, 'coding');
  assert.equal(details.needsExecution, true);
  assert.equal(details.wantsDebate, true);
  assert.equal(details.wantsPlanning, true);
  assert.equal(details.kind, 'task');
});

test('code examples without file changes stay non-executable', function() {
  const details = classifyIntentDetails('不要修改 DualMind 项目文件，只在回复里给我一个最小 HTML 贪吃蛇示例和核心代码');

  assert.equal(details.intent, 'qa');
  assert.equal(details.needsExecution, false);
  assert.equal(details.exampleOnly, true);
  assert.equal(details.kind, 'chat');
});

test('Chinese requests to write code onto the desktop are executable coding tasks', function() {
  const details = classifyIntentDetails('能不能给我写一个计算器的代码，放到桌面');

  assert.equal(details.intent, 'coding');
  assert.equal(details.needsExecution, true);
  assert.equal(details.kind, 'task');
});

test('Chinese code examples with explicit no-file instruction stay non-executable', function() {
  const details = classifyIntentDetails('给我一个计算器代码示例，不要改文件');

  assert.equal(details.intent, 'qa');
  assert.equal(details.needsExecution, false);
  assert.equal(details.exampleOnly, true);
});

test('discussion plan separates daily chat, debate, and execution review', function() {
  assert.equal(discussionPlanFor(classifyIntentDetails('hello'), {}).style, 'daily-chat');
  assert.equal(discussionPlanFor(classifyIntentDetails('你们俩辩论一下方案'), {}).style, 'debate');
  assert.equal(discussionPlanFor(classifyIntentDetails('帮我修改代码'), {}).style, 'execution-review');
  assert.equal(discussionPlanFor(classifyIntentDetails('设计一个方案'), {}).style, 'quick-review');
  assert.equal(discussionPlanFor(classifyIntentDetails('请 Hermes 复核一下这个回答'), {}).style, 'quick-review');
});
