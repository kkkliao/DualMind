require('dotenv').config();

const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const QRCode = require('qrcode');
const { createDualMindApp } = require('./src/app-factory');
const OpenClawAdapter = require('./src/agents/openclaw-adapter');
const HermesAdapter = require('./src/agents/hermes-adapter');
const { cleanAgentOutput, runCli } = require('./src/utils/cli');
const { NonceStore, normalizeWechatPairPayload, parseWechatXml, queueWechatMessage, validHttpUrl, wechatReplayValid, wechatSignatureValid, wechatToken } = require('./src/channels/wechat-channel');
const { executionBlockMessage } = require('./src/coordinator/execution-capability');
const { ExecutionLockManager, intentNeedsExecutor } = require('./src/coordinator/execution-lock');
const { classifyIntent, classifyIntentDetails, discussionPlanFor, requiresRiskConfirmation } = require('./src/coordinator/intent');
const { decideRemoteMessagePolicy } = require('./src/coordinator/remote-policy');
const { agentEmoji, agentName, getRoleMode, normalizeRoleMode, pickAgents } = require('./src/coordinator/roles');
const { policyWarningForReply } = require('./src/coordinator/policy');
const { buildAgentPrompt, debateBudget, detectMention, executionHolder, executionInstruction, roleForAgent, turnTranscriptText } = require('./src/coordinator/speaker-policy');
const { decideTurnStatus } = require('./src/coordinator/turn-status');
const { ConfigStore } = require('./src/store/config-store');
const { TaskStore } = require('./src/store/task-store');
const { TurnStore } = require('./src/store/turn-store');
const { sse, writeDone } = require('./src/streaming/sse-writer');
const { streamText, waitForMinThinking } = require('./src/streaming/simulated-stream');

function nativeWechatUin() {
  var raw = String(Math.floor(Math.random() * 0xffffffff));
  return Buffer.from(raw, 'utf-8').toString('base64');
}

const app = createDualMindApp({ publicDir: path.join(__dirname, 'public') });
const CONFIG_PATH = path.join(__dirname, 'config.json');
const DATA_DIR = path.join(__dirname, 'data');
const ASSET_VERSION = '2026.5.20.1';
const DEFAULT_PORT = Number(process.env.DUALMIND_PORT || process.env.PORT || 3000);
const WECHAT_CHANNEL_ID = 'openclaw-weixin';
var runtimeDataDir = DATA_DIR;
var adapterFactory = defaultAdapters;
var executionLock = new ExecutionLockManager(agentName);
var turnStore = new TurnStore(runtimeDataDir);
var taskStore = new TaskStore(runtimeDataDir);
var configStore = new ConfigStore(CONFIG_PATH);
var agentReplyTests = loadAgentReplyTests();
var wechatNonceStore = new NonceStore();
var wechatQrStarter = startOfficialWeixinQr;
var wechatQrWaiter = waitOfficialWeixinQr;

function readText(fileName, fallback) {
  try {
    return fs.readFileSync(path.join(__dirname, fileName), 'utf-8');
  } catch {
    return fallback;
  }
}

const OC_PROMPT = readText('oc-prompt.txt', 'You are OpenClaw in a local DualMind group chat.');
const HM_PROMPT = readText('hermes-prompt.txt', 'You are Hermes in a local DualMind group chat.');

function ensureDataDir() {
  try { fs.mkdirSync(runtimeDataDir, { recursive: true }); } catch {}
}

function loadCfg() {
  return configStore.load();
}

function saveCfg(config) {
  configStore.save(config);
}

function publicConfig(config) {
  return configStore.publicConfig(config);
}

function renderHtml(fileName) {
  return readText(path.join('public', fileName), '').replace(/\{\{ASSET_VERSION\}\}/g, ASSET_VERSION);
}

function currentLocalContext() {
  var now = new Date();
  var timeZone = 'local time';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
  } catch {}
  var options = {
    hour12: false,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };
  if (timeZone !== 'local time') options.timeZone = timeZone;
  try {
    return now.toLocaleString('en-US', options) + ' ' + timeZone;
  } catch {
    return now.toString();
  }
}

function configFileExists() {
  try {
    return !!(configStore && configStore.configPath && fs.existsSync(configStore.configPath));
  } catch {
    return false;
  }
}

function configNeedsSetup(config) {
  if (!configFileExists()) return true;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return true;
  if (config.setup && config.setup.completed === true) return false;
  if (config.setup && config.setup.completed === false) return true;

  var roleModeReady = config.roleMode === 'openclaw-main' || config.roleMode === 'hermes-main';
  var openClawReady = !!(config.openclaw && typeof config.openclaw === 'object' && !Array.isArray(config.openclaw));
  var hermesReady = !!(config.hermes && typeof config.hermes === 'object' && !Array.isArray(config.hermes));
  var safetyReady = !!(config.safety && typeof config.safety === 'object' && !Array.isArray(config.safety));
  return !(roleModeReady && openClawReady && hermesReady && safetyReady);
}

function historyPath() {
  ensureDataDir();
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return path.join(runtimeDataDir, 'chat-' + y + '-' + m + '-' + dd + '.json');
}

function loadHistory() {
  try {
    var p = historyPath();
    if (fs.existsSync(p)) return sanitizeHistory(JSON.parse(fs.readFileSync(p, 'utf-8')));
  } catch {}
  return [];
}

function sanitizeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map(function(message) {
    var copy = Object.assign({}, message);
    if ((copy.t === 'oc' || copy.t === 'hm') && typeof copy.c === 'string') {
      var cleaned = cleanAgentOutput(copy.c);
      if (cleaned) copy.c = cleaned;
      else if (copy.c.trim().charAt(0) === '{') copy.c = '[Archived agent metadata omitted]';
    }
    return copy;
  });
}

function turnHistoryMeta(turn) {
  if (!turn) return {};
  return {
    turnId: turn.id || '',
    roleMode: normalizeRoleMode(turn.roleMode),
    intent: turn.intent || '',
    executor: turn.executor || null,
    primary: turn.primary || null,
    secondary: turn.secondary || null,
    discussionStyle: turn.discussionPlan && turn.discussionPlan.style ? turn.discussionPlan.style : ''
  };
}

function sameHistoryText(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

function historyAgentMatches(historyType, turnAgent) {
  if (historyType === 'user') return turnAgent === 'user';
  if (historyType === 'oc' || historyType === 'hm') return turnAgent === historyType;
  return false;
}

function findHistoryTurn(message, turns) {
  var bestTurn = null;
  var bestScore = Infinity;
  var ts = Number(message.ts || 0);
  for (var t = 0; t < turns.length; t++) {
    var turn = turns[t];
    var items = Array.isArray(turn.messages) ? turn.messages : [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      if (!historyAgentMatches(message.t, item.agent)) continue;
      if (!sameHistoryText(message.c, item.content)) continue;
      var itemTs = Number(item.ts || turn.startedAt || 0);
      var score = ts && itemTs ? Math.abs(ts - itemTs) : 0;
      if (score < bestScore) {
        bestScore = score;
        bestTurn = turn;
      }
    }
  }
  return bestScore <= 10000 ? bestTurn : null;
}

function enrichHistoryWithTurns(messages) {
  var list = sanitizeHistory(messages);
  var needsMeta = list.some(function(message) {
    return (message.t === 'user' || message.t === 'oc' || message.t === 'hm') && !message.turnId;
  });
  if (!needsMeta) return list;
  var turns = turnStore.list(200);
  return list.map(function(message) {
    if (message.turnId || (message.t !== 'user' && message.t !== 'oc' && message.t !== 'hm')) return message;
    var turn = findHistoryTurn(message, turns);
    return turn ? Object.assign({}, message, turnHistoryMeta(turn)) : message;
  });
}

function historyMessage(type, content, turn) {
  return Object.assign({ t: type, c: content, ts: Date.now() }, turnHistoryMeta(turn));
}

function saveHistory(messages) {
  try {
    ensureDataDir();
    fs.writeFileSync(historyPath(), JSON.stringify(messages, null, 2));
  } catch {}
}

function loadAgentReplyTests() {
  try {
    var agentHealthPath = path.join(runtimeDataDir, 'agent-health.json');
    if (fs.existsSync(agentHealthPath)) {
      var value = JSON.parse(fs.readFileSync(agentHealthPath, 'utf-8'));
      return value && typeof value === 'object' ? value : {};
    }
  } catch {}
  return {};
}

function saveAgentReplyTests() {
  try {
    ensureDataDir();
    fs.writeFileSync(path.join(runtimeDataDir, 'agent-health.json'), JSON.stringify(agentReplyTests, null, 2));
  } catch {}
}

function releaseExecutionLock(holder) {
  executionLock.release(holder);
}

function releaseTurnLease(turnId) {
  if (!turnId) return;
  turnStore.updateActionLease(turnId, { status: 'released', releasedAt: Date.now() });
}

function contextFromHistory(history) {
  return history.slice(-12).map(function(message) {
    var meta = message.turnId ? ' [turn ' + String(message.turnId).slice(-6) + ', mode ' + normalizeRoleMode(message.roleMode) + ', executor ' + (message.executor ? agentName(message.executor) : 'none') + ']' : '';
    if (message.t === 'user') return 'User' + meta + ': ' + message.c;
    if (message.t === 'oc') return 'OpenClaw' + meta + ': ' + message.c;
    if (message.t === 'hm') return 'Hermes' + meta + ': ' + message.c;
    if (message.t && message.t.startsWith('coord-')) return 'Coordination: ' + message.c;
    return String(message.t || 'message') + ': ' + message.c;
  }).join('\n');
}

function buildPrompt(agent, options) {
  var base = agent === 'oc' ? OC_PROMPT : HM_PROMPT;
  return buildAgentPrompt(agent, base, options);
}

function defaultAdapters(config) {
  return {
    oc: new OpenClawAdapter(config.openclaw || {}),
    hm: new HermesAdapter(config.hermes || {})
  };
}

function adapters(config) {
  return adapterFactory(config || {});
}

function configureTestRuntime(options) {
  options = options || {};
  runtimeDataDir = options.dataDir || DATA_DIR;
  configStore = new ConfigStore(options.configPath || CONFIG_PATH);
  turnStore = new TurnStore(runtimeDataDir);
  taskStore = new TaskStore(runtimeDataDir);
  executionLock = new ExecutionLockManager(agentName);
  wechatNonceStore = new NonceStore();
  agentReplyTests = {};
  adapterFactory = options.adapterFactory || defaultAdapters;
  wechatQrStarter = options.wechatQrStarter || startOfficialWeixinQr;
  wechatQrWaiter = options.wechatQrWaiter || waitOfficialWeixinQr;
}

function resetRuntime() {
  configureTestRuntime({});
  agentReplyTests = loadAgentReplyTests();
}

function testStores() {
  return { turnStore: turnStore, taskStore: taskStore, configStore: configStore };
}

function agentCapabilities(config, agent) {
  var registry = adapters(config);
  var adapter = registry[agent];
  return adapter && typeof adapter.capabilities === 'function' ? adapter.capabilities() : { streamingMode: 'simulated', trueStreaming: false, simulatedStreaming: true };
}

function allAgentCapabilities(config) {
  var registry = adapters(config);
  return {
    oc: registry.oc.capabilities(),
    hm: registry.hm.capabilities()
  };
}

function openclawStateDir() {
  return process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw');
}

function openclawConfigPath() {
  return process.env.OPENCLAW_CONFIG || path.join(openclawStateDir(), 'openclaw.json');
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function normalizeWeixinAccountId(accountId) {
  return String(accountId || '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function listLocalWeixinAccounts() {
  var stateDir = openclawStateDir();
  var ids = [];
  var index = readJsonFile(path.join(stateDir, 'openclaw-weixin', 'accounts.json'));
  if (Array.isArray(index)) {
    index.forEach(function(id) {
      if (typeof id === 'string' && id.trim()) ids.push(id.trim());
    });
  }
  if (ids.length) return ids;

  var openclawConfig = readJsonFile(openclawConfigPath());
  var accounts = openclawConfig && openclawConfig.channels && openclawConfig.channels[WECHAT_CHANNEL_ID] && openclawConfig.channels[WECHAT_CHANNEL_ID].accounts;
  if (accounts && typeof accounts === 'object') {
    Object.keys(accounts).forEach(function(id) {
      if (id !== 'default' && ids.indexOf(id) === -1) ids.push(id);
    });
  }

  return ids;
}

async function wechatPluginModule(relPath) {
  var packageRoot = path.join(__dirname, 'node_modules', '@tencent-weixin', 'openclaw-weixin');
  var target = path.join(packageRoot, relPath);
  return import(pathToFileURL(target).href);
}

async function startOfficialWeixinQr() {
  var api = await wechatPluginModule(path.join('dist', 'src', 'api', 'api.js'));
  var accounts = await wechatPluginModule(path.join('dist', 'src', 'auth', 'accounts.js'));
  var login = await wechatPluginModule(path.join('dist', 'src', 'auth', 'login-qr.js'));
  var existing = listLocalWeixinAccounts();
  var accountId = existing.length ? existing[0] : 'dualmind-' + Date.now();
  var botType = login.DEFAULT_ILINK_BOT_TYPE || '3';
  var baseUrl = accounts.DEFAULT_BASE_URL || 'https://ilinkai.weixin.qq.com';
  var localTokenList = existing.map(function(id) {
    try {
      var account = accounts.loadWeixinAccount(id);
      return account && account.token ? String(account.token).trim() : '';
    } catch {
      return '';
    }
  }).filter(Boolean).slice(-10).reverse();

  var raw = await api.apiPostFetch({
    baseUrl: baseUrl,
    endpoint: 'ilink/bot/get_bot_qrcode?bot_type=' + encodeURIComponent(botType),
    body: JSON.stringify({ local_token_list: localTokenList }),
    timeoutMs: 15000,
    label: 'dualmindFetchWeixinQRCode'
  });
  var payload = JSON.parse(raw);
  var qrcode = String(payload.qrcode || '').trim();
  var qrcodeUrl = validHttpUrl(payload.qrcode_img_content || payload.qrcodeUrl || payload.qrcode_url || '');
  if (!qrcode || !qrcodeUrl) {
    return {
      ok: false,
      qrUrl: '',
      qrImage: '',
      pairingUrl: '',
      sessionKey: '',
      status: 'qr-start-failed',
      error: 'The official WeChat plugin did not return a QR code link.'
    };
  }

  var sessionKey = 'dualmind-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  var sessions = global.__dualmindWechatQrSessions || (global.__dualmindWechatQrSessions = new Map());
  sessions.set(sessionKey, {
    qrcode: qrcode,
    accountId: accountId,
    baseUrl: baseUrl,
    botType: botType,
    startedAt: Date.now()
  });

  return {
    ok: true,
    qrUrl: qrcodeUrl,
    qrImage: await QRCode.toDataURL(qrcodeUrl, { margin: 1, width: 260 }),
    pairingUrl: qrcodeUrl,
    sessionKey: sessionKey,
    status: 'qr-ready',
    error: '',
    message: '用手机微信扫描以下二维码，以继续连接：'
  };
}

async function waitOfficialWeixinQr(sessionKey) {
  if (!sessionKey) return { ok: false, status: 'missing-session', error: 'Missing WeChat login session.' };
  var sessions = global.__dualmindWechatQrSessions || new Map();
  var session = sessions.get(sessionKey);
  if (!session) return { ok: false, status: 'missing-session', error: 'The WeChat QR session was not found or has expired.' };
  if (Date.now() - session.startedAt > 5 * 60 * 1000) {
    sessions.delete(sessionKey);
    return { ok: false, status: 'expired', error: 'The WeChat QR code has expired. Generate a new one.' };
  }
  var api = await wechatPluginModule(path.join('dist', 'src', 'api', 'api.js'));
  var accounts = await wechatPluginModule(path.join('dist', 'src', 'auth', 'accounts.js'));
  var raw = await api.apiGetFetch({
    baseUrl: session.baseUrl || accounts.DEFAULT_BASE_URL || 'https://ilinkai.weixin.qq.com',
    endpoint: 'ilink/bot/get_qrcode_status?qrcode=' + encodeURIComponent(session.qrcode),
    timeoutMs: 1500,
    label: 'dualmindCheckWeixinQRCode'
  });
  var result = JSON.parse(raw);
  if (result.status === 'confirmed' && result.ilink_bot_id) {
    var normalizedId = normalizeWeixinAccountId(result.ilink_bot_id);
    accounts.saveWeixinAccount(normalizedId, {
      token: result.bot_token,
      baseUrl: result.baseurl,
      userId: result.ilink_user_id
    });
    accounts.registerWeixinAccountId(normalizedId);
    if (typeof accounts.clearStaleAccountsForUserId === 'function') {
      accounts.clearStaleAccountsForUserId(normalizedId, result.ilink_user_id);
    }
    try { await accounts.triggerWeixinChannelReload(); } catch {}
    sessions.delete(sessionKey);
    return { ok: true, connected: true, alreadyConnected: false, status: 'paired', accountId: normalizedId, error: '已将此 OpenClaw 连接到微信。' };
  }
  if (result.status === 'binded_redirect') {
    sessions.delete(sessionKey);
    return { ok: true, connected: false, alreadyConnected: true, status: 'paired', accountId: '', error: '已连接过此 OpenClaw，无需重复连接。' };
  }
  if (result.status === 'expired') {
    sessions.delete(sessionKey);
    return { ok: false, connected: false, alreadyConnected: false, status: 'expired', accountId: '', error: '二维码已过期，请重新生成。' };
  }
  return {
    ok: false,
    connected: false,
    alreadyConnected: false,
    status: result && result.status ? result.status : 'pending',
    accountId: '',
    error: result && result.status === 'scaned' ? '已扫码，正在等待手机确认。' : '还没有检测到配对完成，请扫码并在手机上确认后再试。'
  };
}

function isOfficialWeixinPluginInstalled(openclawPluginsText) {
  return /@tencent-weixin\/openclaw-weixin|openclaw-weixin/i.test(openclawPluginsText || '');
}

function isOfficialWeixinPluginConfigured(openclawChannelsText) {
  return /openclaw-weixin:[^\n]*installed,[^\n]*(configured|enabled)|openclaw-weixin[\s\S]*configured:\s*true/i.test(openclawChannelsText || '');
}

function isOfficialWeixinPluginEnabled(openclawChannelsText) {
  return /openclaw-weixin:[^\n]*installed,[^\n]*configured,[^\n]*enabled|openclaw-weixin[\s\S]*enabled:\s*true/i.test(openclawChannelsText || '');
}

function thinkingText(agent, suffix) {
  return agentEmoji(agent) + ' ' + agentName(agent) + ' ' + suffix;
}

function shouldRunExecutorReviewFollowUp(intent, route, primaryResult, secondaryResult, turnErrors) {
  if (!intentNeedsExecutor(intent)) return false;
  if (!route || !route.primary || !route.secondary) return false;
  if (!primaryResult || !primaryResult.ok) return false;
  if (!secondaryResult || !secondaryResult.ok || !secondaryResult.reply) return false;
  if (Array.isArray(turnErrors) && turnErrors.length) return false;
  return true;
}

function shouldRunConversationCalibration(intent, route, firstResult, secondResult, turnErrors) {
  if (intentNeedsExecutor(intent)) return false;
  if (!route || !route.primary || !route.secondary) return false;
  if (!firstResult || !firstResult.ok || !firstResult.reply) return false;
  if (!secondResult || !secondResult.ok || !secondResult.reply) return false;
  if (Array.isArray(turnErrors) && turnErrors.length) return false;
  return true;
}

function agentRunOptions(agent, holder, extra) {
  var options = extra ? Object.assign({}, extra) : {};
  if (holder && agent !== holder) options.reviewOnly = true;
  return Object.keys(options).length ? options : null;
}

function shouldRunCalibrationAck(calibrationResult) {
  if (!calibrationResult || !calibrationResult.ok) return false;
  var text = String(calibrationResult.reply || '').trim();
  if (!text) return false;
  if (/NO[_\s-]?CORRECTION|无需纠正|没有需要纠正|无须纠正/i.test(text)) return false;
  return true;
}

async function runAgent(agent, prompt, config, cwd, options) {
  options = options || {};
  var registry = adapters(config);
  var adapter = registry[agent];
  return adapter.reply({ prompt: prompt, cwd: cwd || __dirname, timeoutMs: 180000, timeoutSeconds: 180, reviewOnly: !!options.reviewOnly });
}

async function runAgentTest(agent, config) {
  var registry = adapters(config);
  var adapter = registry[agent];
  return adapter.reply({
    prompt: 'Reply with exactly: ok',
    cwd: __dirname,
    timeoutMs: 90000,
    timeoutSeconds: 90
  });
}

async function binaryVersion(bin) {
  if (!bin) return '';
  var result = await runCli(bin, ['--version'], { timeoutMs: 5000, cwd: __dirname });
  var text = ((result.stdout || '') + '\n' + (result.stderr || '')).trim();
  return text.split(/\r?\n/).filter(Boolean)[0] || '';
}

function latestAgentResult(agent) {
  var testResult = agentReplyTests[agent] || null;
  var turns = turnStore.list(100);
  for (var t = 0; t < turns.length; t++) {
    var messages = Array.isArray(turns[t].messages) ? turns[t].messages : [];
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].agent !== agent) continue;
      var ts = messages[i].ts || turns[t].finishedAt || turns[t].startedAt;
      if (testResult && Number(testResult.ts || 0) > Number(ts || 0)) return testResult;
      if (messages[i].type === 'agent') return { ok: true, ts: ts, turnId: turns[t].id, source: 'turn', error: '' };
      if (messages[i].type === 'error') return { ok: false, ts: ts, turnId: turns[t].id, source: 'turn', error: messages[i].content || '' };
    }
  }
  if (testResult) return testResult;
  return { ok: null, ts: null, turnId: '', source: '', error: '' };
}

function healthFromStatus(agent, status, version, capabilities) {
  var last = latestAgentResult(agent);
  capabilities = capabilities || {};
  return {
    agent: agent,
    name: agentName(agent),
    binaryFound: !!status.binPath,
    binPath: status.binPath || '',
    version: version || '',
    gatewayRunning: !!status.gatewayRunning,
    gatewayUrl: status.gatewayUrl || '',
    port: status.port || '',
    lastReplyOk: last.ok,
    lastReplyAt: last.ts,
    lastTurnId: last.turnId,
    lastReplySource: last.source || '',
    lastError: last.error,
    streamingSupported: !!capabilities.trueStreaming,
    streamingMode: capabilities.streamingMode || 'simulated'
  };
}

function displayAgentName(agent) {
  if (agent === 'oc' || agent === 'hm') return agentName(agent);
  if (agent === 'user') return 'User';
  return agent || 'System';
}

function turnReplayMarkdown(turn) {
  var lines = [
    '# DualMind Turn Replay',
    '',
    '- Turn: `' + (turn.id || '') + '`',
    '- Status: `' + (turn.status || '') + '`',
    '- Intent: `' + (turn.intent || '') + '`',
    '- Role mode: `' + (turn.roleMode || '') + '`',
    '- Executor: `' + (turn.executor || 'none') + '`',
    '- Source: `' + ((turn.source || 'web') + (turn.remoteUser ? ' / ' + turn.remoteUser : '')) + '`'
  ];

  if (turn.actionLease) {
    lines.push('', '## Action Lease', '');
    lines.push('- Owner: `' + (turn.actionLease.owner || turn.actionLease.agent || '') + '`');
    lines.push('- Status: `' + (turn.actionLease.status || '') + '`');
    lines.push('- Scope: ' + (turn.actionLease.scope || ''));
  }

  if (Array.isArray(turn.policyWarnings) && turn.policyWarnings.length) {
    lines.push('', '## Policy Warnings', '');
    turn.policyWarnings.forEach(function(warning) {
      lines.push('- `' + (warning.agent || '') + '` ' + (warning.reason || '') + ': ' + (warning.message || ''));
    });
  }

  var agentStates = turn.agentStates || {};
  var stateAgents = Object.keys(agentStates);
  if (stateAgents.length) {
    lines.push('', '## Agent States', '');
    stateAgents.forEach(function(agent) {
      var state = agentStates[agent] || {};
      lines.push('- ' + displayAgentName(agent) + ': `' + (state.state || 'idle') + '`' + (state.streamingMode ? ' / `' + state.streamingMode + '`' : '') + (state.error ? ' / ' + state.error : ''));
    });
  }

  lines.push('', '## Messages', '');
  (turn.messages || []).forEach(function(message) {
    lines.push('### ' + displayAgentName(message.agent) + ' / ' + (message.type || 'message'));
    lines.push('');
    lines.push(String(message.content || '').trim() || '(empty)');
    lines.push('');
  });

  lines.push('## Events', '');
  (turn.events || []).forEach(function(event) {
    lines.push('- `' + (event.type || 'event') + '` ' + (event.agent ? displayAgentName(event.agent) + ' ' : '') + new Date(event.ts || Date.now()).toISOString());
  });

  return lines.join('\n').trim() + '\n';
}

async function emitAgentReply(res, history, agent, prompt, config, thinkText, done, turn, policyContext, runOptions) {
  runOptions = runOptions || {};
  var thinkStartedAt = Date.now();
  sse(res, { t: 'think', a: agent, d: thinkText });
  if (turn) {
    turnStore.setAgentState(turn.id, agent, 'thinking', { label: thinkText, startedAt: thinkStartedAt });
    turnStore.addEvent(turn.id, { type: 'think', agent: agent, label: thinkText });
  }
  var result = await runAgent(agent, prompt, config, __dirname, runOptions);
  await waitForMinThinking(thinkStartedAt, config);

  if (!result.ok) {
    var error = result.error || agentName(agent) + ' failed to respond.';
    if (turn) {
      turnStore.setAgentState(turn.id, agent, 'error', { error: error });
      turnStore.addMessage(turn.id, { type: 'error', agent: agent, content: error });
      turnStore.addEvent(turn.id, { type: 'agentError', agent: agent, error: error });
    }
    sse(res, { t: 'agentError', a: agent, d: error });
    return { ok: false, agent: agent, reply: '', error: error };
  }

  sse(res, { t: 'doneThink', a: agent });
  var reply = result.content || '';
  if (runOptions.suppressNoCorrection && /NO[_\s-]?CORRECTION|无需纠正|没有需要纠正|无须纠正/i.test(String(reply).trim())) {
    if (turn) {
      turnStore.setAgentState(turn.id, agent, 'done', { hiddenReply: true });
      turnStore.addEvent(turn.id, { type: 'noCorrection', agent: agent });
    }
    return { ok: true, agent: agent, reply: '', hidden: true, error: '' };
  }
  var streamingMode = result.streamingMode || agentCapabilities(config, agent).streamingMode || 'simulated';
  sse(res, { t: 'streamMode', a: agent, d: streamingMode });
  if (turn) {
    turnStore.setAgentState(turn.id, agent, 'streaming', { streamingMode: streamingMode });
    turnStore.addEvent(turn.id, { type: 'streamMode', agent: agent, mode: streamingMode });
  }
  await streamText(res, agent, reply, done);
  history.push(historyMessage(agent, reply, turn));
  saveHistory(history);
  if (turn) {
    turnStore.setAgentState(turn.id, agent, 'done', { streamingMode: streamingMode });
    turnStore.addMessage(turn.id, { type: 'agent', agent: agent, content: reply });
  }
  if (turn && policyContext) {
    var warning = policyWarningForReply({
      agent: agent,
      executor: policyContext.executor,
      intent: policyContext.intent,
      text: reply
    });
    if (warning) {
      turnStore.addPolicyWarning(turn.id, warning);
      sse(res, { t: 'policyWarning', a: agent, d: warning.message });
    }
  }
  return { ok: true, agent: agent, reply: reply, error: '' };
}

app.post('/api/chat', async function(req, res) {
  var body = req.body || {};
  var messages = body.messages || [];
  var userMsg = body.message || (messages.length ? messages[messages.length - 1].content : '') || 'Hi';
  var config = loadCfg();
  config.roleMode = normalizeRoleMode(body.roleMode || config.roleMode);
  var mentioned = detectMention(userMsg, body.agent);
  var intentDetails = classifyIntentDetails(userMsg);
  var intent = intentDetails.intent;
  var discussionPlan = discussionPlanFor(intentDetails, config);
  var route = pickAgents(config.roleMode, mentioned, intent);
  var capabilities = allAgentCapabilities(config);
  var history = loadHistory();
  var holder = executionHolder(route, mentioned, intent);
  var localContext = currentLocalContext();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  var turn = turnStore.create({
    roleMode: route.roleMode,
    intent: intent,
    mentioned: mentioned,
    executor: holder,
    primary: route.primary,
    secondary: route.secondary,
    lockAcquired: false,
    userMessage: userMsg,
    intentDetails: intentDetails,
    discussionPlan: discussionPlan
  });
  turnStore.addMessage(turn.id, { type: 'user', agent: 'user', content: userMsg });
  history.push(historyMessage('user', userMsg, turn));
  saveHistory(history);

  sse(res, { t: 'turnStart', turnId: turn.id, roleMode: route.roleMode, intent: intent, discussionStyle: discussionPlan.style, primary: route.primary, secondary: route.secondary, executor: holder });

  if (requiresRiskConfirmation(config, intent, body.confirmRisky === true)) {
    var confirmMessage = 'Risky action detected. Please confirm before DualMind lets an executor continue.';
    turnStore.addEvent(turn.id, { type: 'riskConfirmationRequired', error: confirmMessage });
    turnStore.finish(turn.id, 'needs-confirmation', { error: confirmMessage });
    sse(res, { t: 'confirmRisky', turnId: turn.id, d: confirmMessage });
    writeDone(res);
    res.end();
    return;
  }

  var capabilityBlock = holder ? executionBlockMessage(holder, capabilities[holder], intent) : null;
  if (capabilityBlock) {
    turnStore.addEvent(turn.id, { type: 'executionCapabilityBlocked', agent: holder, reason: capabilityBlock.reason, error: capabilityBlock.message });
    turnStore.finish(turn.id, 'blocked', {
      error: capabilityBlock.message,
      blockedReason: capabilityBlock.reason,
      blockedAgent: holder,
      blockedCapabilities: capabilityBlock.capabilities
    });
    sse(res, { t: 'executionBlocked', turnId: turn.id, a: holder, d: capabilityBlock.message, reason: capabilityBlock.reason, capabilities: capabilityBlock.capabilities });
    writeDone(res);
    res.end();
    return;
  }

  var lock = executionLock.acquire(holder, intent, userMsg);
  var lockAcquired = !!lock.acquired;
  var task = null;
  if (lock.acquired) {
    task = taskStore.create({
      turnId: turn.id,
      status: 'leased',
      intent: intent,
      executor: holder,
      reviewer: route.reviewer || null,
      roleMode: route.roleMode,
      source: turn.source || 'web',
      userMessage: userMsg,
      leaseId: lock.lease && lock.lease.id,
      capabilities: holder ? capabilities[holder] : null
    });
    turnStore.update(turn.id, function(value) {
      value.lockAcquired = true;
      value.actionLease = lock.lease || null;
      value.taskId = task.id;
    });
    taskStore.addEvent(task.id, { type: 'taskLeaseCreated', turnId: turn.id, leaseId: lock.lease && lock.lease.id, executor: holder });
    turnStore.addEvent(turn.id, {
      type: 'actionLease',
      agent: holder,
      intent: intent,
      leaseId: lock.lease && lock.lease.id,
      scope: lock.lease && lock.lease.scope,
      expiresAt: lock.lease && lock.lease.expiresAt
    });
    sse(res, { t: 'actionLease', lease: lock.lease, taskId: task.id });
  }

  if (!lock.ok) {
    turnStore.addEvent(turn.id, { type: 'lockRejected', error: lock.error });
    turnStore.finish(turn.id, 'rejected', { error: lock.error });
    sse(res, { t: 'e', d: lock.error });
    writeDone(res);
    res.end();
    return;
  }

  var context = contextFromHistory(history);
  var turnItems = [];
  var turnErrors = [];
  var policyContext = { executor: holder, intent: intent };
  try {
    var primaryInstruction = [
      'Reply publicly to the user as ' + agentName(route.primary) + '.',
      executionInstruction(route.primary, route, mentioned, intent),
      'If this is a task, state your role clearly in natural language.',
      'Do not repeat another AI.'
    ].join(' ');
      var primaryPrompt = buildPrompt(route.primary, {
        context: context,
        userMsg: userMsg,
        roleMode: route.roleMode,
        role: roleForAgent(route.primary, route, mentioned, intent),
        executor: holder,
        localContext: localContext,
        instruction: primaryInstruction
      });

    var primaryResult = await emitAgentReply(
      res,
      history,
      route.primary,
      primaryPrompt,
      config,
      thinkingText(route.primary, 'is responding...'),
      true,
      turn,
      policyContext,
      agentRunOptions(route.primary, holder)
    );
    if (primaryResult.ok && primaryResult.reply) turnItems.push({ agent: route.primary, text: primaryResult.reply });
    if (!primaryResult.ok) turnErrors.push({ agent: route.primary, error: primaryResult.error });

    var secondaryResult = null;
    if (route.secondary) {
      var secondaryInstruction = [
        'Reply publicly as ' + agentName(route.secondary) + '.',
        executionInstruction(route.secondary, route, mentioned, intent),
        'This is not silent review. Add a useful new angle, caveat, correction, or natural group-chat response.',
        'If you disagree, address ' + agentName(route.primary) + ' directly and calmly.',
        'Keep it concise unless the user asked for debate.'
      ].join(' ');
      var secondaryPrompt = buildPrompt(route.secondary, {
        context: context,
        previous: primaryResult.reply,
        userMsg: userMsg,
        roleMode: route.roleMode,
        role: roleForAgent(route.secondary, route, mentioned, intent),
        executor: holder,
        localContext: localContext,
        instruction: secondaryInstruction
      });

      secondaryResult = await emitAgentReply(
      res,
      history,
      route.secondary,
        secondaryPrompt,
        config,
        thinkingText(route.secondary, 'is adding a perspective...'),
        true,
      turn,
      policyContext,
      agentRunOptions(route.secondary, holder)
    );
      if (secondaryResult.ok && secondaryResult.reply) turnItems.push({ agent: route.secondary, text: secondaryResult.reply });
      if (!secondaryResult.ok) turnErrors.push({ agent: route.secondary, error: secondaryResult.error });
    }

    var budget = route.secondary && turnErrors.length === 0 && discussionPlan.style === 'debate' ? Math.max(debateBudget(config, route, intent), discussionPlan.maxMessages) : 0;
    for (var count = turnItems.length; count < budget; count++) {
      var nextAgent = count % 2 === 0 ? route.primary : route.secondary;
      var peerAgent = nextAgent === route.primary ? route.secondary : route.primary;
      var finalRound = count === budget - 1;
      var debateInstruction = [
        'Continue the public group discussion as ' + agentName(nextAgent) + '.',
        executionInstruction(nextAgent, route, mentioned, intent),
        finalRound ? 'This is the final debate message: converge on decision points, remaining risks, and who should execute if execution is needed.' : 'Respond to the latest point directly, add a new reason or correction, and move the group closer to a decision.',
        'Keep the tone conversational with ' + agentName(peerAgent) + ' and the user.'
      ].join(' ');
      var debatePrompt = buildPrompt(nextAgent, {
        context: context + '\n' + turnTranscriptText(turnItems),
        previous: turnTranscriptText(turnItems),
        userMsg: userMsg,
        roleMode: route.roleMode,
        role: roleForAgent(nextAgent, route, mentioned, intent),
        executor: holder,
        localContext: localContext,
        instruction: debateInstruction
      });
      var debateResult = await emitAgentReply(
        res,
        history,
        nextAgent,
        debatePrompt,
        config,
        thinkingText(nextAgent, finalRound ? 'is converging the debate...' : 'is debating the point...'),
        true,
        turn,
        policyContext,
        agentRunOptions(nextAgent, holder)
      );
      if (debateResult.ok && debateResult.reply) {
        turnItems.push({ agent: nextAgent, text: debateResult.reply });
      } else {
        turnErrors.push({ agent: nextAgent, error: debateResult.error });
        break;
      }
    }
    var executorResult = null;
    var reviewerResult = null;
    if (route.executor && primaryResult && primaryResult.agent === route.executor) executorResult = primaryResult;
    if (route.executor && secondaryResult && secondaryResult.agent === route.executor) executorResult = secondaryResult;
    if (route.reviewer && primaryResult && primaryResult.agent === route.reviewer) reviewerResult = primaryResult;
    if (route.reviewer && secondaryResult && secondaryResult.agent === route.reviewer) reviewerResult = secondaryResult;
    if (shouldRunExecutorReviewFollowUp(intent, route, executorResult, reviewerResult, turnErrors)) {
      var followUpInstruction = [
        'Reply publicly as ' + agentName(route.executor) + ' and close the execution-review loop.',
        executionInstruction(route.executor, route, mentioned, intent),
        agentName(route.reviewer) + ' has reviewed or challenged the work. Address that AI directly in group-chat language.',
        'You must choose one clear path: apply a safe in-scope improvement now, ask the user for confirmation if the change expands scope or risk, or explain why you are not applying the suggestion.',
        'Do not start another review cycle. Do not claim to edit files or run commands unless your adapter actually performed that work in this reply.',
        'End with the current state and the next step for the user.'
      ].join(' ');
      var followUpPrompt = buildPrompt(route.executor, {
        context: context + '\n' + turnTranscriptText(turnItems),
        previous: turnTranscriptText(turnItems),
        userMsg: userMsg,
        roleMode: route.roleMode,
        role: roleForAgent(route.executor, route, mentioned, intent),
        executor: holder,
        localContext: localContext,
        instruction: followUpInstruction
      });
      turnStore.addEvent(turn.id, { type: 'executorReviewFollowUp', agent: route.executor, reviewer: route.reviewer });
      if (task) taskStore.addEvent(task.id, { type: 'executorReviewFollowUp', turnId: turn.id, executor: route.executor, reviewer: route.reviewer });
      var followUpResult = await emitAgentReply(
        res,
        history,
        route.executor,
        followUpPrompt,
        config,
        thinkingText(route.executor, 'is responding to the review...'),
        true,
        turn,
        policyContext
      );
      if (followUpResult.ok && followUpResult.reply) {
        turnItems.push({ agent: route.executor, text: followUpResult.reply });
      } else {
        turnErrors.push({ agent: route.executor, error: followUpResult.error });
      }
    }
    if (shouldRunConversationCalibration(intent, route, primaryResult, secondaryResult, turnErrors)) {
      var calibrator = route.executor || route.primary;
      var ackAgent = calibrator === route.primary ? route.secondary : route.primary;
      var calibrationInstruction = [
        'You are doing a final public calibration pass as ' + agentName(calibrator) + '.',
        'Only reply if the previous messages contain a clear factual, time, safety, role, or instruction-following problem that should be corrected now.',
        'Current local context is ' + localContext + '. Use it to catch time-of-day mistakes, but do not mention it unless correcting something.',
        'If a correction is needed, address ' + agentName(ackAgent) + ' directly in a friendly group-chat tone, give the corrected answer, and keep it concise.',
        'If there is no meaningful correction, reply exactly: NO_CORRECTION'
      ].join(' ');
      var calibrationPrompt = buildPrompt(calibrator, {
        context: context + '\n' + turnTranscriptText(turnItems),
        previous: turnTranscriptText(turnItems),
        userMsg: userMsg,
        roleMode: route.roleMode,
        role: roleForAgent(calibrator, route, mentioned, intent),
        executor: holder,
        localContext: localContext,
        instruction: calibrationInstruction
      });
      turnStore.addEvent(turn.id, { type: 'conversationCalibrationCheck', agent: calibrator, target: ackAgent });
      var calibrationResult = await emitAgentReply(
        res,
        history,
        calibrator,
        calibrationPrompt,
        config,
        thinkingText(calibrator, 'is checking the group answer...'),
        true,
        turn,
        policyContext,
        agentRunOptions(calibrator, holder, { suppressNoCorrection: true })
      );
      if (calibrationResult.ok && calibrationResult.reply) {
        turnItems.push({ agent: calibrator, text: calibrationResult.reply });
      } else if (!calibrationResult.ok) {
        turnErrors.push({ agent: calibrator, error: calibrationResult.error });
      }
      if (shouldRunCalibrationAck(calibrationResult)) {
        var ackInstruction = [
          'Reply publicly as ' + agentName(ackAgent) + '.',
          agentName(calibrator) + ' corrected or calibrated your previous message.',
          'Acknowledge briefly that you understand, correct your wording, and close the loop. Do not restart debate.'
        ].join(' ');
        var ackPrompt = buildPrompt(ackAgent, {
          context: context + '\n' + turnTranscriptText(turnItems),
          previous: turnTranscriptText(turnItems),
          userMsg: userMsg,
          roleMode: route.roleMode,
          role: roleForAgent(ackAgent, route, mentioned, intent),
          executor: holder,
          localContext: localContext,
          instruction: ackInstruction
        });
        turnStore.addEvent(turn.id, { type: 'conversationCalibrationAck', agent: ackAgent, calibrator: calibrator });
        var ackResult = await emitAgentReply(
          res,
          history,
          ackAgent,
          ackPrompt,
          config,
          thinkingText(ackAgent, 'is acknowledging the correction...'),
          true,
          turn,
          policyContext,
          agentRunOptions(ackAgent, holder)
        );
        if (ackResult.ok && ackResult.reply) {
          turnItems.push({ agent: ackAgent, text: ackResult.reply });
        } else {
          turnErrors.push({ agent: ackAgent, error: ackResult.error });
        }
      }
    }
    var finalStatus = decideTurnStatus(turnItems.length, turnErrors.length);
    var finishExtra = { responseCount: turnItems.length, errorCount: turnErrors.length };
    if (turnErrors.length) finishExtra.errors = turnErrors;
    turnStore.finish(turn.id, finalStatus, finishExtra);
    if (task) taskStore.finish(task.id, finalStatus === 'done' ? 'done' : 'partial', { responseCount: turnItems.length, errorCount: turnErrors.length, error: turnErrors[0] ? turnErrors[0].error : '' });
    sse(res, { t: 'turnDone', turnId: turn.id, status: finalStatus, responseCount: turnItems.length, errorCount: turnErrors.length });
  } catch (err) {
    var error = 'Error: ' + (err.message || String(err)).slice(0, 180);
    turnStore.addEvent(turn.id, { type: 'serverError', error: error });
    turnStore.finish(turn.id, 'error', { error: error });
    if (task) taskStore.finish(task.id, 'error', { error: error });
    sse(res, { t: 'e', d: error });
  } finally {
    if (lockAcquired) {
      releaseTurnLease(turn.id);
      turnStore.addEvent(turn.id, { type: 'actionLeaseReleased', agent: holder });
      if (task) taskStore.addEvent(task.id, { type: 'actionLeaseReleased', turnId: turn.id, executor: holder });
    }
    releaseExecutionLock(holder);
  }

  writeDone(res);
  res.end();
});

app.get('/api/history', function(req, res) {
  res.json({ ok: true, messages: enrichHistoryWithTurns(loadHistory()) });
});

app.get('/api/turns', function(req, res) {
  res.json({
    ok: true,
    turns: turnStore.list(req.query.limit || 50, {
      status: req.query.status || '',
      intent: req.query.intent || '',
      source: req.query.source || '',
      executor: req.query.executor || ''
    })
  });
});

app.get('/api/turns/:id', function(req, res) {
  var turn = turnStore.get(req.params.id);
  if (!turn) {
    res.status(404).json({ ok: false, error: 'Turn not found' });
    return;
  }
  res.json({ ok: true, turn: turn });
});

app.get('/api/tasks', function(req, res) {
  res.json({
    ok: true,
    tasks: taskStore.list(req.query.limit || 50, {
      status: req.query.status || '',
      executor: req.query.executor || '',
      source: req.query.source || ''
    })
  });
});

app.get('/api/tasks/:id', function(req, res) {
  var task = taskStore.get(req.params.id);
  if (!task) {
    res.status(404).json({ ok: false, error: 'Task not found' });
    return;
  }
  res.json({ ok: true, task: task });
});

app.get('/api/turns/:id/replay', function(req, res) {
  var turn = turnStore.get(req.params.id);
  if (!turn) {
    res.status(404).json({ ok: false, error: 'Turn not found' });
    return;
  }
  res.json({
    ok: true,
    turnId: turn.id,
    filename: 'dualmind-turn-' + String(turn.id || '').slice(-8) + '.md',
    markdown: turnReplayMarkdown(turn)
  });
});

app.post('/api/turns/:id/retry', function(req, res) {
  var turn = turnStore.get(req.params.id);
  if (!turn) {
    res.status(404).json({ ok: false, error: 'Turn not found' });
    return;
  }
  res.json({
    ok: true,
    turnId: turn.id,
    message: turn.userMessage || '',
    roleMode: normalizeRoleMode(turn.roleMode),
    agent: turn.mentioned || null
  });
});

app.post('/api/turns/:id/continue', function(req, res) {
  var turn = turnStore.get(req.params.id);
  if (!turn) {
    res.status(404).json({ ok: false, error: 'Turn not found' });
    return;
  }
  if (turn.status !== 'queued') {
    res.status(409).json({ ok: false, error: 'Only queued remote turns can be continued in the Web UI.', status: turn.status });
    return;
  }
  turnStore.addEvent(turn.id, { type: 'continuedInWeb', source: turn.source || 'web', remoteUser: turn.remoteUser || '' });
  res.json({
    ok: true,
    turnId: turn.id,
    message: turn.userMessage || '',
    roleMode: normalizeRoleMode(turn.roleMode),
    agent: turn.mentioned || null,
    source: turn.source || 'web',
    remoteUser: turn.remoteUser || '',
    intent: turn.intent || 'casual'
  });
});

app.post('/api/turns/:id/cancel', function(req, res) {
  var turn = turnStore.get(req.params.id);
  if (!turn) {
    res.status(404).json({ ok: false, error: 'Turn not found' });
    return;
  }
  if (turn.status !== 'running' && turn.status !== 'needs-confirmation' && turn.status !== 'queued') {
    res.status(409).json({ ok: false, error: 'Only running, queued, or confirmation-pending turns can be cancelled.', status: turn.status });
    return;
  }
  turnStore.addEvent(turn.id, { type: 'cancelledByUser' });
  var updated = turnStore.finish(turn.id, 'cancelled');
  res.json({ ok: true, turn: updated });
});

app.post('/api/history/clear', function(req, res) {
  try { fs.unlinkSync(historyPath()); } catch {}
  res.json({ ok: true });
});

app.get('/api/status', async function(req, res) {
  var config = loadCfg();
  config.roleMode = normalizeRoleMode(config.roleMode);
  var registry = adapters(config);
  var openclaw = await registry.oc.status();
  var hermes = await registry.hm.status();
  var wechat = await checkWechat(config, registry.oc.binPath());

  res.json({
    ok: true,
    openclaw: openclaw,
    hermes: hermes,
    wechat: wechat,
    agents: {
      oc: latestAgentResult('oc'),
      hm: latestAgentResult('hm')
    },
    capabilities: {
      oc: registry.oc.capabilities(),
      hm: registry.hm.capabilities()
    },
    config: publicConfig(config),
    historyCount: loadHistory().length
  });
});

app.get('/api/agents/health', async function(req, res) {
  var config = loadCfg();
  var registry = adapters(config);
  var openclaw = await registry.oc.status();
  var hermes = await registry.hm.status();
  var ocVersion = await binaryVersion(openclaw.binPath);
  var hmVersion = await binaryVersion(hermes.binPath);
  res.json({
    ok: true,
    agents: {
      oc: healthFromStatus('oc', openclaw, ocVersion, registry.oc.capabilities()),
      hm: healthFromStatus('hm', hermes, hmVersion, registry.hm.capabilities())
    }
  });
});

app.post('/api/agents/:agent/test', async function(req, res) {
  var agent = req.params.agent === 'hm' ? 'hm' : req.params.agent === 'oc' ? 'oc' : '';
  if (!agent) {
    res.status(404).json({ ok: false, error: 'Unknown agent.' });
    return;
  }
  var config = loadCfg();
  var result = await runAgentTest(agent, config);
  agentReplyTests[agent] = {
    ok: !!result.ok,
    ts: Date.now(),
    turnId: '',
    source: 'reply-test',
    error: result.ok ? '' : (result.error || agentName(agent) + ' failed reply test.')
  };
  saveAgentReplyTests();
  res.json({
    ok: !!result.ok,
    agent: agent,
    content: result.ok ? (result.content || '') : '',
    error: result.ok ? '' : (result.error || agentName(agent) + ' failed reply test.')
  });
});

async function checkWechat(config, openclawBin) {
  var gatewayUrl = (config.openclaw && config.openclaw.gatewayUrl ? config.openclaw.gatewayUrl : 'http://127.0.0.1:18789').replace(/\/$/, '');
  var status = {
    integrated: true,
    installerBundled: true,
    pluginBundled: true,
    installed: false,
    configured: false,
    enabled: false,
    paired: false,
    channel: false,
    pairEndpoint: false,
    pairEndpointKind: '',
    gatewayUrl: gatewayUrl,
    error: ''
  };
  if (!openclawBin) {
    status.error = 'OpenClaw CLI not found.';
    return status;
  }

  try {
    var response = await fetch(gatewayUrl + '/__openclaw__/wechat/pair', { method: 'HEAD', signal: AbortSignal.timeout(1500) });
    var contentType = response.headers && response.headers.get ? (response.headers.get('content-type') || '') : '';
    status.pairEndpoint = response.status !== 404;
    status.pairEndpointKind = /json/i.test(contentType) ? 'json' : (/html/i.test(contentType) ? 'page' : '');
    status.channel = response.ok || response.status === 405 || response.status === 400 || response.status === 401 || response.status === 403;
  } catch (err) {
    status.error = 'OpenClaw Gateway pairing endpoint is not reachable.';
  }

  var ocStatus = await runCli(openclawBin, ['status'], { timeoutMs: 8000, cwd: __dirname });
  var statusText = (ocStatus.stdout || '') + '\n' + (ocStatus.stderr || '');
  var pluginList = await runCli(openclawBin, ['plugins', 'list'], { timeoutMs: 12000, cwd: __dirname });
  var channelList = await runCli(openclawBin, ['channels', 'list', '--all'], { timeoutMs: 12000, cwd: __dirname });
  var channelsText = (channelList.stdout || '') + '\n' + (channelList.stderr || '');
  var pluginText = (pluginList.stdout || '') + '\n' + (pluginList.stderr || '');
  var localAccounts = listLocalWeixinAccounts();

  status.installed = isOfficialWeixinPluginInstalled(pluginText) || isOfficialWeixinPluginInstalled(channelsText);
  status.configured = isOfficialWeixinPluginConfigured(channelsText) || localAccounts.length > 0;
  status.enabled = isOfficialWeixinPluginEnabled(channelsText) || status.configured;
  status.paired = localAccounts.length > 0 || /wechat|weixin/i.test(statusText);
  status.channel = status.channel || status.installed || status.configured || status.paired;
  status.accountCount = localAccounts.length;
  if (!status.installed) status.error = 'Official OpenClaw WeChat plugin is not installed. Use the bundled installer in Settings.';
  else if (!status.configured) status.error = 'Official OpenClaw WeChat plugin is installed but not paired. Generate a QR code and scan it with WeChat.';
  return status;
}

app.get('/api/wechat/pair', async function(req, res) {
  var config = loadCfg();
  var gatewayUrl = (config.openclaw && config.openclaw.gatewayUrl ? config.openclaw.gatewayUrl : 'http://127.0.0.1:18789').replace(/\/$/, '');
  var pairUrl = gatewayUrl + '/__openclaw__/wechat/pair';
  try {
    var official = await wechatQrStarter();
    if (official.ok) {
      res.json(Object.assign({ gatewayUrl: gatewayUrl }, official));
      return;
    }
  } catch (err) {
    var officialError = err && err.message ? err.message : String(err);
    res.json({
      ok: false,
      qrUrl: '',
      qrImage: '',
      pairingUrl: '',
      gatewayUrl: gatewayUrl,
      status: 'official-plugin-error',
      error: 'Official WeChat QR generation failed: ' + officialError
    });
    return;
  }
  try {
    var response = await fetch(pairUrl, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      var contentType = response.headers && response.headers.get ? (response.headers.get('content-type') || '') : '';
      if (/json/i.test(contentType)) {
        var data = await response.json();
        var pair = normalizeWechatPairPayload(data, gatewayUrl);
        res.json(pair);
        return;
      }
      var text = await response.text();
      if (/html/i.test(contentType) || /<html|<openclaw-app|OpenClaw Control/i.test(text)) {
        res.json({
          ok: false,
          qrUrl: '',
          qrImage: '',
          pairingUrl: '',
          gatewayUrl: gatewayUrl,
          status: 'gateway-control-page',
          error: 'OpenClaw Gateway returned the control page, not a WeChat QR code. Use the bundled official WeChat plugin installer, then generate the QR code again.'
        });
        return;
      }
      var parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      if (parsed) {
        res.json(normalizeWechatPairPayload(parsed, gatewayUrl));
        return;
      }
      res.json({ ok: false, qrUrl: '', qrImage: '', pairingUrl: '', gatewayUrl: gatewayUrl, status: 'no-pairing-url', error: 'OpenClaw Gateway responded, but did not provide a valid WeChat QR or pairing URL.' });
      return;
    }
    res.json({ ok: false, qrUrl: '', qrImage: '', pairingUrl: '', gatewayUrl: gatewayUrl, status: 'gateway-error', error: 'OpenClaw Gateway did not return a WeChat pairing URL.' });
    return;
  } catch (err) {
    res.json({ ok: false, qrUrl: '', qrImage: '', pairingUrl: '', gatewayUrl: gatewayUrl, status: 'gateway-unreachable', error: 'OpenClaw Gateway pairing endpoint is not reachable.' });
  }
});

app.post('/api/wechat/install', async function(req, res) {
  var installer = process.platform === 'win32'
    ? path.join(__dirname, 'node_modules', '.bin', 'weixin-installer.cmd')
    : path.join(__dirname, 'node_modules', '.bin', 'weixin-installer');
  if (!fs.existsSync(installer)) {
    res.json({
      ok: false,
      code: -1,
      status: 'installer-missing',
      output: '',
      error: 'Bundled official WeChat installer is missing. Run npm install first.'
    });
    return;
  }
  var result = await runCli(installer, ['install'], {
    cwd: __dirname,
    timeoutMs: 60000
  });
  res.json({
    ok: !!result.ok,
    code: result.code,
    status: result.ok ? 'installed' : 'install-incomplete',
    output: cleanAgentOutput(((result.stdout || '') + '\n' + (result.stderr || '')).trim()).slice(-4000),
    error: result.ok ? '' : (result.stderr || result.stdout || 'Official WeChat installer did not complete.')
  });
});

app.post('/api/wechat/pair/confirm', async function(req, res) {
  var sessionKey = req.body && req.body.sessionKey ? String(req.body.sessionKey) : '';
  try {
    var result = await wechatQrWaiter(sessionKey);
    res.json(result);
  } catch (err) {
    res.json({ ok: false, status: 'confirm-error', error: err && err.message ? err.message : String(err) });
  }
});

app.get('/api/wechat/check', async function(req, res) {
  var config = loadCfg();
  var openclaw = new OpenClawAdapter(config.openclaw || {});
  var wx = await checkWechat(config, openclaw.binPath());
  res.json(wx);
});

app.post('/api/config', function(req, res) {
  var config = loadCfg();
  var body = req.body || {};

  if (body.openclaw) config.openclaw = Object.assign({}, config.openclaw || {}, body.openclaw);
  if (body.hermes) config.hermes = Object.assign({}, config.hermes || {}, body.hermes);
  if (body.wechat) config.wechat = Object.assign({}, config.wechat || {}, body.wechat);
  if (body.server) config.server = Object.assign({}, config.server || {}, body.server);
  if (body.safety) config.safety = Object.assign({}, config.safety || {}, body.safety);
  if (body.collaboration) config.collaboration = Object.assign({}, config.collaboration || {}, body.collaboration);
  if (body.setup) config.setup = Object.assign({}, config.setup || {}, body.setup);
  if (body.roleMode) config.roleMode = normalizeRoleMode(body.roleMode);

  saveCfg(config);
  res.json({ ok: true, config: publicConfig(config) });
});

app.get('/api/setup/detect', async function(req, res) {
  var config = loadCfg();
  var registry = adapters(config);
  var openclaw = await registry.oc.status();
  var hermes = await registry.hm.status();
  res.json({
    ok: true,
    detected: {
      openclaw: {
        binPath: openclaw.binPath,
        gatewayUrl: openclaw.gatewayUrl || '',
        port: openclaw.port || '',
        running: openclaw.running,
        gatewayRunning: openclaw.gatewayRunning
      },
      hermes: {
        binPath: hermes.binPath,
        running: hermes.running
      }
    }
  });
});

app.get('/api/setup/state', function(req, res) {
  var config = loadCfg();
  res.json({
    ok: true,
    needsSetup: configNeedsSetup(config),
    hasConfig: configFileExists(),
    config: publicConfig(config)
  });
});

app.get('/api/wechat', function(req, res) {
  var config = loadCfg();
  var token = wechatToken(config);
  if (!wechatSignatureValid(req.query, token)) {
    res.status(403).send('forbidden');
    return;
  }
  if (token) {
    var replay = wechatReplayValid(req.query, wechatNonceStore);
    if (!replay.ok) {
      res.status(403).send('forbidden');
      return;
    }
  }
  res.send(req.query.echostr || '');
});

app.post('/api/wechat', function(req, res) {
  var config = loadCfg();
  var token = wechatToken(config);
  if (!wechatSignatureValid(req.query, token)) {
    res.status(403).type('application/xml').send('<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[signature invalid]]></Content></xml>');
    return;
  }
  if (token) {
    var replay = wechatReplayValid(req.query, wechatNonceStore);
    if (!replay.ok) {
      res.status(403).type('application/xml').send('<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[replay rejected]]></Content></xml>');
      return;
    }
  }

  if (!config.wechat || config.wechat.enabled === false) {
    res.type('application/xml').send('<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[WeChat integration is disabled.]]></Content></xml>');
    return;
  }

  var payload = parseWechatXml(req.body || '');
  var authorized = Array.isArray(config.wechat && config.wechat.authorizedUsers) ? config.wechat.authorizedUsers : [];
  if (authorized.length && payload.fromUserName && authorized.indexOf(payload.fromUserName) === -1) {
    res.type('application/xml').send('<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[not authorized]]></Content></xml>');
    return;
  }

  var content = payload.content || '';
  var intent = classifyIntent(content);
  var policy = decideRemoteMessagePolicy(config, intent);
  queueWechatMessage(turnStore, config, payload, intent);
  res.type('application/xml').send('<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[' + policy.response + ']]></Content></xml>');
});

app.post('/api/restart', function(req, res) {
  res.json({ ok: true });
  setTimeout(function() { process.exit(0); }, 500);
});

app.get('/', function(req, res) {
  if (configNeedsSetup(loadCfg())) {
    res.redirect(302, '/setup');
    return;
  }
  res.type('html').send(renderHtml('index.html'));
});

app.get('/setup', function(req, res) {
  res.type('html').send(renderHtml('setup.html'));
});

module.exports = {
  ASSET_VERSION,
  app,
  configureTestRuntime,
  configNeedsSetup,
  resetRuntime,
  testStores,
  shouldRunExecutorReviewFollowUp
};

if (require.main === module) {
  var startConfig = loadCfg();
  var HOST = process.env.DUALMIND_HOST || (startConfig.server && startConfig.server.host) || '127.0.0.1';
  var PORT = Number(process.env.DUALMIND_PORT || process.env.PORT || (startConfig.server && startConfig.server.port) || DEFAULT_PORT);
  app.listen(PORT, HOST, function() {
    console.log('DualMind → http://' + HOST + ':' + PORT);
  });
}
