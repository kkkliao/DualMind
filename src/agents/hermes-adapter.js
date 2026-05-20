const { cleanAgentOutput, resolveBinary, runCli } = require('../utils/cli');
const { normalizeCapabilities } = require('./adapter-contract');

const HERMES_FALLBACKS = [
  '/usr/local/bin/hermes',
  '~/.local/bin/hermes',
  '~/.hermes/hermes-agent/venv/bin/hermes'
];

class HermesAdapter {
  constructor(config) {
    this.config = config || {};
  }

  binPath() {
    return resolveBinary(this.config.binPath, HERMES_FALLBACKS, 'hermes');
  }

  async status() {
    var bin = this.binPath();
    if (!bin) return { running: false, binPath: '' };
    return { running: true, binPath: bin };
  }

  capabilities() {
    return normalizeCapabilities({
      trueStreaming: false,
      simulatedStreaming: true,
      streamingMode: 'simulated',
      gateway: false,
      toolExecution: true,
      canExecuteFiles: true,
      canRunCommands: true,
      canRestrictTools: false
    });
  }

  async reply(input) {
    input = input || {};
    var bin = this.binPath();
    if (!bin) {
      return { ok: false, agent: 'hm', content: '', error: 'Hermes CLI not found. Configure the Hermes path in Settings.' };
    }

    var args = ['chat', '-Q', '--source', 'dualmind', '-q', input.prompt || ''];
    if (input.reviewOnly) {
      args.push('--toolsets', this.config.reviewToolsets || 'safe');
      args.push('--max-turns', String(this.config.reviewMaxTurns || 1));
    }
    var result = await runCli(bin, args, {
      cwd: input.cwd || process.cwd(),
      timeoutMs: input.timeoutMs || 180000
    });

    var content = cleanAgentOutput(result.stdout);
    var failureText = (content + '\n' + (result.stderr || '')).trim();
    if (/^(API call failed|Error:|Traceback|HTTP \d{3}:|usage limit exceeded)/i.test(failureText) || /HTTP 429|usage limit exceeded/i.test(failureText)) {
      return { ok: false, agent: 'hm', content: '', raw: result.stdout, error: content || result.stderr || 'Hermes failed' };
    }
    if (!result.ok && !content) {
      return { ok: false, agent: 'hm', content: '', raw: result.stdout, error: result.stderr || 'Hermes failed' };
    }

    return {
      ok: true,
      agent: 'hm',
      content: content || 'Hermes did not return a response.',
      streamingMode: this.capabilities().streamingMode,
      raw: result.stdout,
      stderr: result.stderr
    };
  }
}

module.exports = HermesAdapter;
