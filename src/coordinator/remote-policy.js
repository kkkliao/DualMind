function decideRemoteMessagePolicy(config, intent) {
  var safety = (config && config.safety) || {};
  var executable = intent === 'coding' || intent === 'risky';
  if (executable) {
    return {
      queue: true,
      mayExecute: safety.allowRemoteCodeExecution === true,
      requiresWebConfirmation: safety.allowRemoteCodeExecution !== true,
      response: safety.allowRemoteCodeExecution === true
        ? 'Received. Open DualMind Web UI to supervise this action.'
        : 'Please continue in the web UI to confirm this action.'
    };
  }

  return {
    queue: true,
    mayExecute: false,
    requiresWebConfirmation: false,
    response: 'Received. Open DualMind Web UI to continue.'
  };
}

module.exports = {
  decideRemoteMessagePolicy
};
