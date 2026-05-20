function classifyIntent(text) {
  return classifyIntentDetails(text).intent;
}

function classifyIntentDetails(text) {
  var value = text || '';
  var isRisky = /删除|重置|清空|rm\s|reset|kill|卸载|delete|remove|wipe/i.test(value);
  var exampleOnly = /只(?:在回复里|回复|展示|给|提供|输出).*?(代码|示例|片段)|不要(?:改|修改|改动|创建|写入|保存).*?(项目|文件|代码)|不(?:改|修改|改动|创建|写入|保存).*?(项目|文件|代码)|别(?:改|修改|改动|创建|写入|保存).*?(项目|文件|代码)|do not (?:modify|edit|write|create|save).*?(?:project|file|code)|don'?t (?:modify|edit|write|create|save).*?(?:project|file|code)|without (?:modifying|editing|writing|creating|saving).*?(?:project|file|code)|(?:reply|answer|show|provide|output) only.*?(?:code|example|snippet)/i.test(value);
  var executionSignal = /修改|改动|修复|重构|更新|写入|创建|保存|运行|执行|落地|部署|测试|文件|项目|配置|bug|implement|refactor|fix|edit|modify|update|write|create|save|run|execute|deploy|test|file|project|config/i.test(value);
  var codeCreationSignal = /(?:写|编写|做|开发|实现|生成|创建|保存).*?(?:代码|脚本|程序|网页|页面|工具|计算器|app|html|HTML)|(?:代码|脚本|程序|网页|页面|工具|计算器|app|html|HTML).*?(?:写|编写|做|开发|实现|生成|创建|保存)/i.test(value);
  var fileTargetSignal = /放到|放在|存到|存进|保存到|保存进|写到|写进|生成到|生成在|桌面|Desktop|Downloads|下载目录|文件夹|目录|路径/i.test(value);
  var needsExecution = isRisky || ((executionSignal || codeCreationSignal || fileTargetSignal) && !exampleOnly);
  var wantsDebate = /你们俩|两位|两个\s*AI|双方|分别|辩论|怎么看|debate|compare|both of you|both AIs/i.test(value);
  var wantsReview = /复核|校准|审查|检查|review|calibrate|double-check/i.test(value);
  var wantsPlanning = /方案|设计|架构|规划|升级|plan|design|architecture|roadmap/i.test(value);
  var wantsExplanation = exampleOnly || /为什么|怎么|解释|what|why|how|explain/i.test(value);
  var intent = 'casual';
  if (isRisky) intent = 'risky';
  else if (needsExecution) intent = 'coding';
  else if (wantsDebate) intent = 'debate';
  else if (wantsPlanning) intent = 'planning';
  else if (wantsExplanation) intent = 'qa';
  return {
    intent: intent,
    kind: needsExecution ? 'task' : (wantsDebate || wantsPlanning ? 'discussion' : 'chat'),
    needsExecution: needsExecution,
    isRisky: isRisky,
    exampleOnly: exampleOnly,
    wantsDebate: wantsDebate,
    wantsReview: wantsReview,
    wantsPlanning: wantsPlanning,
    wantsExplanation: wantsExplanation,
    confidence: value.trim() ? 0.7 : 0.3
  };
}

function discussionPlanFor(intentDetails, config) {
  intentDetails = intentDetails || {};
  var collab = (config && config.collaboration) || {};
  var maxDebate = Number(collab.architectureDebateMessageBudget || collab.negotiationMessageBudget || 6);
  if (!Number.isFinite(maxDebate)) maxDebate = 6;
  maxDebate = Math.max(4, Math.min(12, Math.floor(maxDebate)));
  if (intentDetails.wantsDebate) {
    return { style: 'debate', minRounds: 2, maxMessages: maxDebate, requiresConvergence: true };
  }
  if (intentDetails.needsExecution) {
    return { style: 'execution-review', minRounds: 1, maxMessages: 2, requiresConvergence: true };
  }
  if (intentDetails.wantsPlanning || intentDetails.wantsReview) {
    return { style: 'quick-review', minRounds: 1, maxMessages: 2, requiresConvergence: true };
  }
  return { style: 'daily-chat', minRounds: 1, maxMessages: 2, requiresConvergence: false };
}

function legacyClassifyIntent(text) {
  var value = text || '';
  if (/删除|重置|清空|rm\s|reset|kill|卸载|delete|remove|wipe/i.test(value)) return 'risky';
  if (/改|修|实现|重构|代码|bug|测试|文件|implement|refactor|code|test|file/i.test(value)) return 'coding';
  if (/你们俩|分别|辩论|怎么看|debate|compare|both of you/i.test(value)) return 'debate';
  if (/方案|设计|架构|规划|升级|plan|design|architecture|roadmap/i.test(value)) return 'planning';
  if (/为什么|怎么|解释|what|why|how|explain/i.test(value)) return 'qa';
  return 'casual';
}

function requiresRiskConfirmation(config, intent, confirmed) {
  var safety = (config && config.safety) || {};
  return intent === 'risky' && safety.confirmRisky !== false && confirmed !== true;
}

module.exports = {
  classifyIntent,
  classifyIntentDetails,
  discussionPlanFor,
  legacyClassifyIntent,
  requiresRiskConfirmation
};
