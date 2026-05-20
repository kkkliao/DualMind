const { agentName } = require('./roles');

function executionCapabilityFor(capabilities) {
  capabilities = capabilities || {};
  return {
    canExecuteFiles: !!capabilities.canExecuteFiles,
    canRunCommands: !!capabilities.canRunCommands,
    canRestrictTools: !!capabilities.canRestrictTools,
    toolExecution: !!capabilities.toolExecution
  };
}

function canExecuteIntent(capabilities, intent) {
  var caps = executionCapabilityFor(capabilities);
  if (intent !== 'coding' && intent !== 'risky') return true;
  return !!(caps.toolExecution && (caps.canExecuteFiles || caps.canRunCommands));
}

function executionBlockReason(agent, capabilities, intent) {
  if (canExecuteIntent(capabilities, intent)) return '';
  var name = agentName(agent);
  if (agent === 'oc') {
    return name + ' is currently configured for infer/read-only chat. Switch OpenClaw to agent mode or choose Hermes as main executor before running code or command tasks.';
  }
  return name + ' does not currently advertise file or command execution capability. Choose another main executor or update the Hermes adapter configuration.';
}

function executionBlockMessage(agent, capabilities, intent) {
  var reason = executionBlockReason(agent, capabilities, intent);
  if (!reason) return null;
  return {
    ok: false,
    status: 'blocked',
    reason: 'executor-capability-missing',
    agent: agent,
    intent: intent,
    message: reason,
    capabilities: executionCapabilityFor(capabilities)
  };
}

module.exports = {
  canExecuteIntent,
  executionBlockMessage,
  executionBlockReason,
  executionCapabilityFor
};
