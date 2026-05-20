const { cleanAgentOutput, extractTextFromJson, parseJsonOutput, resolveBinary, runCli } = require('../utils/cli');
const { normalizeCapabilities } = require('./adapter-contract');

const OPENCLAW_FALLBACKS = [
  '~/.npm-global/bin/openclaw',
  '/usr/local/bin/openclaw',
  '/opt/homebrew/bin/openclaw'
];

class OpenClawAdapter {
  constructor(config) {
    this.config = config || {};
  }

  binPath() {
    return resolveBinary(this.config.binPath, OPENCLAW_FALLBACKS, 'openclaw');
  }

  async status() {
    var bin = this.binPath();
    var gateway = await this.gatewayStatus();
    return {
      running: !!bin,
      binPath: bin || '',
      gatewayRunning: gateway.running,
      port: gateway.port,
      gatewayUrl: gateway.gatewayUrl
    };
  }

  capabilities() {
    var mode = this.config.mode || 'agent';
    var agentMode = mode === 'agent';
    return normalizeCapabilities({
      trueStreaming: false,
      simulatedStreaming: true,
      streamingMode: 'simulated',
      gateway: true,
      toolExecution: agentMode,
      canExecuteFiles: agentMode,
      canRunCommands: agentMode,
      canRestrictTools: agentMode,
      readOnlyMode: !agentMode
    });
  }

  async gatewayStatus() {
    var configured = (this.config.gatewayUrl || '').trim();
    var urls = [];
    if (configured) urls.push(configured);
    urls.push('http://127.0.0.1:18789', 'http://localhost:18789', 'http://127.0.0.1:19001', 'http://localhost:19001');

    for (var i = 0; i < urls.length; i++) {
      var url = urls[i].replace(/\/$/, '');
      try {
        var response = await fetch(url + '/health', { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          var portMatch = url.match(/:(\d+)/);
          return { running: true, gatewayUrl: url, port: portMatch ? portMatch[1] : '' };
        }
      } catch {}
    }

    return { running: false, gatewayUrl: configured, port: '' };
  }

  async reply(input) {
    input = input || {};
    var bin = this.binPath();
    if (!bin) {
      return { ok: false, agent: 'oc', content: '', error: 'OpenClaw CLI not found. Configure the OpenClaw path in Settings.' };
    }

    var mode = input.reviewOnly ? 'infer' : (this.config.mode || 'agent');
    var args;
    if (mode === 'agent') {
      args = ['agent', '--json', '--message', input.prompt || ''];
      args.push('--agent', this.config.agentId || 'main');
      if (this.config.sessionId) args.push('--session-id', this.config.sessionId);
      if (input.timeoutSeconds) args.push('--timeout', String(input.timeoutSeconds));
    } else {
      args = ['infer', 'model', 'run', '--json', '--prompt', input.prompt || '', '--thinking', this.config.thinking || 'low'];
      if (this.config.model) args.push('--model', this.config.model);
    }

    var result = await runCli(bin, args, {
      cwd: input.cwd || process.cwd(),
      timeoutMs: input.timeoutMs || 180000
    });

    var parsed = parseJsonOutput(result.stdout);
    var content = parsed ? extractTextFromJson(parsed) : '';
    if (!content) content = cleanAgentOutput(result.stdout);
    var failureText = (content + '\n' + (result.stderr || '')).trim();
    if (/^(API call failed|Error:|Traceback|HTTP \d{3}:|usage limit exceeded)/i.test(failureText) || /HTTP 429|usage limit exceeded/i.test(failureText)) {
      return { ok: false, agent: 'oc', content: '', raw: result.stdout, error: content || result.stderr || 'OpenClaw failed' };
    }

    if (!result.ok && !content) {
      return { ok: false, agent: 'oc', content: '', raw: result.stdout, error: result.stderr || 'OpenClaw failed' };
    }

    return {
      ok: true,
      agent: 'oc',
      content: content || 'OpenClaw did not return a response.',
      streamingMode: this.capabilities().streamingMode,
      raw: result.stdout,
      stderr: result.stderr
    };
  }
}

module.exports = OpenClawAdapter;
