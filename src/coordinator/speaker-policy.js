const { intentNeedsExecutor } = require('./execution-lock');
const { agentName, getRoleMode, normalizeRoleMode } = require('./roles');

function detectMention(text, requestedAgent) {
  if (requestedAgent === 'oc' || requestedAgent === 'hm') return requestedAgent;
  var hasOC = /@OpenClaw/i.test(text || '');
  var hasHM = /@Hermes/i.test(text || '');
  if (hasOC && !hasHM) return 'oc';
  if (hasHM && !hasOC) return 'hm';
  return null;
}

function executionHolder(route, mentionedAgent, intent) {
  return (route && route.executor) || getRoleMode(route && route.roleMode).executor || null;
}

function roleForAgent(agent, route, mentionedAgent, intent) {
  var holder = executionHolder(route || {}, mentionedAgent, intent);
  if (holder === agent) return 'executor/participant';
  if (holder && holder !== agent) return intentNeedsExecutor(intent) ? 'reviewer/calibrator' : 'supporting participant';
  if (intent === 'debate') return 'debater/participant';
  return 'participant';
}

function boundedBudget(value, fallback, min, max) {
  var source = value == null || value === '' ? fallback : value;
  var number = Number(source);
  if (!Number.isFinite(number)) number = fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function debateBudget(config, route, intent) {
  var collab = (config && config.collaboration) || {};
  if (intent === 'debate') {
    return boundedBudget(collab.negotiationMessageBudget || collab.architectureDebateMessageBudget, 6, 4, 12);
  }
  return 0;
}

function turnTranscriptText(items) {
  return (items || []).map(function(item) {
    return agentName(item.agent) + ': ' + item.text;
  }).join('\n');
}

function executionInstruction(agent, route, mentionedAgent, intent) {
  var holder = executionHolder(route || {}, mentionedAgent, intent);
  if (!intentNeedsExecutor(intent)) {
    if (holder === agent) {
      var peer = route && route.reviewer ? agentName(route.reviewer) : 'the supporting AI';
      return 'You are the current main AI and the standing execution holder. If the user asks for a real action, you are the AI that may act; keep ordinary chat conversational unless action is clearly needed. Do not delegate file edits, command execution, or code updates to ' + peer + '.';
    }
    return agentName(holder) + ' is the current main AI and the only AI that may perform real actions. You may chat, suggest, calibrate, debate, correct, and ask useful questions, but do not claim to run commands, edit files, write code to disk, save files, or wait for execution permission. If action is needed, tell ' + agentName(holder) + ' what to do or ask the user whether ' + agentName(holder) + ' should proceed.';
  }
  if (!holder) {
    return 'No AI currently holds execution permission. Discuss the plan, risks, and next step, but do not claim to edit files, run commands, or change configuration.';
  }
  if (holder === agent) {
    var reviewerAgent = (route && route.reviewer) || (route && route.secondary && route.secondary !== holder ? route.secondary : null);
    var reviewer = reviewerAgent ? agentName(reviewerAgent) : 'the supporting AI';
    return 'You hold execution permission for this turn. Keep actions scoped to the user request and acknowledge useful reviewer feedback before proceeding. Do not delegate file edits, command execution, or code updates to ' + reviewer + '; if more work is needed, either do it yourself within scope or ask the user for confirmation.';
  }
  return agentName(holder) + ' holds execution permission. You are the public reviewer/calibrator: advise, correct, ask clarifying questions, or veto unsafe steps, but do not claim to run commands, edit files, write code to disk, save files, or wait for execution permission. If an update is needed, tell ' + agentName(holder) + ' what to change or ask the user whether the executor should proceed.';
}

function buildAgentPrompt(agent, basePrompt, options) {
  options = options || {};
  var peer = agent === 'oc' ? 'Hermes' : 'OpenClaw';
  var self = agentName(agent);
  var roleMode = normalizeRoleMode(options.roleMode);
  var role = options.role || 'participant';
  var executor = options.executor ? agentName(options.executor) : 'none';

  return [
    basePrompt || '',
    '',
    '[DualMind group context]',
    '- You are ' + self + ', one member of a local two-AI group chat with the user and ' + peer + '.',
    '- The project is open-source oriented. Say "user", not a private person name.',
    '- Daily conversation is not silent review: both AIs may naturally speak if they add value.',
    '- Current role mode: ' + roleMode + '.',
    '- Current execution holder: ' + executor + '.',
    '- Your current role in this turn: ' + role + '.',
    options.localContext ? '- Current local context: ' + options.localContext + '.' : '',
    '- If you are not the executor, do not claim that you changed files, ran commands, or edited code.',
    '- If you are not the executor, never say or imply that you will get execution permission later, write files later, save something to disk, or run commands. Ask the executor to act instead.',
    '- If you disagree with ' + peer + ', speak in a calm group-chat tone and focus on the plan.',
    '- Do not output hidden protocol tags such as ///internal or ///approved.',
    '',
    '[Recent conversation]',
    options.context || '(none)',
    '',
    options.previous ? '[' + peer + ' already said]\n' + options.previous + '\n' : '',
    '[User message]',
    options.userMsg || '',
    '',
    options.instruction || 'Reply naturally and helpfully in the user language. Add a distinct perspective; do not repeat the other AI.'
  ].filter(Boolean).join('\n');
}

module.exports = {
  boundedBudget,
  buildAgentPrompt,
  debateBudget,
  detectMention,
  executionHolder,
  executionInstruction,
  roleForAgent,
  turnTranscriptText
};
