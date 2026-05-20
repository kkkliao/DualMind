const { intentNeedsExecutor } = require('./execution-lock');
const { agentName } = require('./roles');

const EXECUTION_CLAIM_PATTERNS = [
  { kind: 'edit', regex: /\bI(?:'ve| have| already| just)?\s+(?:edited|modified|changed|updated|patched|applied|wrote|created|deleted|removed|committed)\b/i },
  { kind: 'run', regex: /\bI(?:'ve| have| already| just)?\s+(?:ran|run|executed|launched|started|stopped|installed|restarted)\b/i },
  { kind: 'edit', regex: /\bI\s+(?:made|applied)\s+(?:the\s+)?(?:change|changes|patch|edit|edits|fix|fixes)\b/i },
  { kind: 'run', regex: /\bI\s+(?:ran|executed)\s+(?:the\s+)?(?:command|test|tests|script|server)\b/i },
  { kind: 'future-edit', regex: /\bI(?:'ll| will| can)\s+(?:write|create|save|edit|modify|update|patch|build|generate)\b/i },
  { kind: 'future-run', regex: /\bI(?:'ll| will| can)\s+(?:run|execute|launch|start|restart|install)\b/i },
  { kind: 'future-permission', regex: /\b(?:when|once|after)\s+I\s+(?:get|have|receive)\s+(?:execution|action|tool)\s+(?:permission|rights|access|lease)\b/i },
  { kind: 'edit', regex: /我(?:已经|已|刚刚|这边已经|这边已)?(?:修改|改了|更新|写入|创建|删除|移除|提交|应用)(?:了|完|好)?/ },
  { kind: 'run', regex: /我(?:已经|已|刚刚|这边已经|这边已)?(?:运行|执行|启动|停止|重启|安装)(?:了|完|好)?/ },
  { kind: 'future-edit', regex: /我(?:这边)?(?:先|可以|来|会|马上|立刻|直接)?(?:把|将)?(?:代码|文件|脚本|程序|框架|网页|页面|计算器).{0,10}(?:写|编写|创建|生成|保存|存到|放到|放进|改|修改|更新|拉好)/ },
  { kind: 'future-edit', regex: /我(?:这边)?(?:先|可以|来|会|马上|立刻|直接)?(?:写|编写|创建|生成|保存|存到|放到|放进|改|修改|更新)(?:代码|文件|脚本|程序|网页|页面|计算器|到桌面|在桌面)/ },
  { kind: 'future-run', regex: /我(?:这边)?(?:先|可以|来|会|马上|立刻|直接)?(?:运行|执行|启动|重启|安装)/ },
  { kind: 'future-permission', regex: /(?:等|待|拿到|获得).{0,8}执行权|执行权.{0,8}(?:给我|到我|轮到我)|秒写|秒放到桌面/ },
  { kind: 'edit', regex: /(?:已经|已|刚刚)(?:修改|改了|更新|写入|创建|删除|移除|提交|应用)(?:了|完|好)?/ },
  { kind: 'run', regex: /(?:已经|已|刚刚)(?:运行|执行|启动|停止|重启|安装)(?:了|完|好)?/ }
];

function detectExecutionClaims(text) {
  var value = String(text || '');
  var claims = [];
  for (var i = 0; i < EXECUTION_CLAIM_PATTERNS.length; i++) {
    var pattern = EXECUTION_CLAIM_PATTERNS[i];
    var match = value.match(pattern.regex);
    if (match) {
      claims.push({
        kind: pattern.kind,
        text: String(match[0] || '').slice(0, 80)
      });
    }
  }
  return claims;
}

function policyWarningForReply(input) {
  input = input || {};
  var agent = input.agent || '';
  var executor = input.executor || '';
  var intent = input.intent || 'casual';
  if (!agent || !executor || agent === executor) return null;

  var claims = detectExecutionClaims(input.text || '');
  if (!claims.length) return null;

  return {
    agent: agent,
    executor: executor,
    intent: intent,
    reason: 'non-executor-claimed-action',
    claims: claims,
    message: agentName(agent) + ' appears to claim execution while ' + agentName(executor) + ' holds the action lease.'
  };
}

module.exports = {
  detectExecutionClaims,
  policyWarningForReply
};
