const DEFAULT_CAPABILITIES = {
  canChat: true,
  canPlan: true,
  canExecuteFiles: false,
  canRunCommands: false,
  canStreamTokens: false,
  canCancel: false,
  canRestrictTools: false,
  trueStreaming: false,
  simulatedStreaming: true,
  streamingMode: 'simulated',
  gateway: false,
  toolExecution: false,
  readOnlyMode: false
};

function normalizeCapabilities(capabilities) {
  var value = Object.assign({}, DEFAULT_CAPABILITIES, capabilities || {});
  value.canChat = value.canChat !== false;
  value.canPlan = value.canPlan !== false;
  if (value.toolExecution === true) {
    if (capabilities && capabilities.canExecuteFiles === undefined) value.canExecuteFiles = true;
    if (capabilities && capabilities.canRunCommands === undefined) value.canRunCommands = true;
  }
  value.toolExecution = !!(value.toolExecution || value.canExecuteFiles || value.canRunCommands);
  if (value.trueStreaming) {
    value.streamingMode = 'true-stream';
    value.simulatedStreaming = false;
    value.canStreamTokens = true;
  } else {
    value.streamingMode = value.streamingMode || 'simulated';
    value.simulatedStreaming = value.simulatedStreaming !== false;
    value.canStreamTokens = false;
  }
  value.canExecuteFiles = !!value.canExecuteFiles;
  value.canRunCommands = !!value.canRunCommands;
  value.canCancel = !!value.canCancel;
  value.canRestrictTools = !!value.canRestrictTools;
  value.readOnlyMode = !!value.readOnlyMode;
  return value;
}

module.exports = {
  DEFAULT_CAPABILITIES,
  normalizeCapabilities
};
