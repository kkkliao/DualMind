const ROLE_MODES = {
  'openclaw-main': { executor: 'oc', reviewer: 'hm', label: 'OpenClaw main' },
  'hermes-main': { executor: 'hm', reviewer: 'oc', label: 'Hermes main' }
};

const LEGACY_ROLE_MODES = {
  'oc-main': 'openclaw-main',
  'h-main': 'hermes-main',
  'hm-main': 'hermes-main',
  'free-chat': 'openclaw-main',
  debate: 'openclaw-main',
  'mention-first': 'openclaw-main',
  'mention-only': 'openclaw-main'
};

function normalizeRoleMode(value) {
  var mode = LEGACY_ROLE_MODES[value] || value || 'openclaw-main';
  return ROLE_MODES[mode] ? mode : 'openclaw-main';
}

function getRoleMode(mode) {
  var normalized = normalizeRoleMode(mode);
  return Object.assign({ id: normalized }, ROLE_MODES[normalized]);
}

function peerAgent(agent) {
  return agent === 'hm' ? 'oc' : 'hm';
}

function intentNeedsExecution(intent) {
  return intent === 'coding' || intent === 'risky';
}

function pickAgents(roleMode, mentionedAgent, intent) {
  var mode = getRoleMode(roleMode);
  var primary = mode.executor;
  var secondary = mode.reviewer;
  if (mentionedAgent === 'oc' || mentionedAgent === 'hm') {
    primary = mentionedAgent;
    secondary = peerAgent(mentionedAgent);
  }
  return {
    primary: primary,
    secondary: secondary,
    executor: mode.executor,
    reviewer: mode.reviewer,
    roleMode: mode.id
  };
}

function agentName(agent) {
  return agent === 'hm' ? 'Hermes' : 'OpenClaw';
}

function agentEmoji(agent) {
  return agent === 'hm' ? '🤖' : '🦞';
}

module.exports = {
  ROLE_MODES,
  agentEmoji,
  agentName,
  getRoleMode,
  normalizeRoleMode,
  peerAgent,
  pickAgents
};
