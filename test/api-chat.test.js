const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const { ASSET_VERSION, app, configNeedsSetup, configureTestRuntime, resetRuntime, testStores } = require('../server');

function makeMockAdapter(agent, options) {
  options = options || {};
  return {
    capabilities() {
      return Object.assign({
        canChat: true,
        canPlan: true,
        canExecuteFiles: true,
        canRunCommands: true,
        canStreamTokens: false,
        canCancel: false,
        canRestrictTools: true,
        trueStreaming: false,
        simulatedStreaming: true,
        streamingMode: 'simulated',
        toolExecution: true,
        readOnlyMode: false
      }, options.capabilities || {});
    },
    async status() {
      return agent === 'oc'
        ? { running: true, binPath: '/mock/openclaw', gatewayRunning: true, gatewayUrl: 'http://127.0.0.1:18789', port: '18789' }
        : { running: true, binPath: '/mock/hermes' };
    },
    binPath() {
      return agent === 'oc' ? '/mock/openclaw' : '/mock/hermes';
    },
    async reply(input) {
      if (options.onReply) return options.onReply(input, agent);
      return {
        ok: true,
        agent: agent,
        content: agent + ' reply' + (input.reviewOnly ? ' review-only' : ''),
        streamingMode: this.capabilities().streamingMode
      };
    }
  };
}

function setup(options) {
  options = options || {};
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dualmind-api-'));
  var configPath = path.join(dir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(Object.assign({
    openclaw: { mode: 'agent' },
    hermes: {},
    roleMode: 'openclaw-main',
    collaboration: { minThinkingMs: 0, streamDelayMs: 0 },
    safety: { confirmRisky: true, allowRemoteCodeExecution: false }
  }, options.config || {}), null, 2));
  var calls = [];
  configureTestRuntime({
    dataDir: dir,
    configPath: configPath,
    adapterFactory: function(config) {
      return {
        oc: makeMockAdapter('oc', Object.assign({}, options.oc, {
          onReply: function(input, agent) {
            calls.push({ agent: agent, reviewOnly: !!input.reviewOnly, prompt: input.prompt || '' });
            return options.oc && options.oc.onReply ? options.oc.onReply(input, agent) : {
              ok: true,
              agent: agent,
              content: 'OpenClaw mock' + (input.reviewOnly ? ' review-only' : ''),
              streamingMode: 'simulated'
            };
          }
        })),
        hm: makeMockAdapter('hm', Object.assign({}, options.hm, {
          onReply: function(input, agent) {
            calls.push({ agent: agent, reviewOnly: !!input.reviewOnly, prompt: input.prompt || '' });
            return options.hm && options.hm.onReply ? options.hm.onReply(input, agent) : {
              ok: true,
              agent: agent,
              content: 'Hermes mock' + (input.reviewOnly ? ' review-only' : ''),
              streamingMode: 'simulated'
            };
          }
        }))
      };
    },
    wechatQrStarter: options.wechatQrStarter,
    wechatQrWaiter: options.wechatQrWaiter
  });
  return { dir: dir, configPath: configPath, calls: calls };
}

async function appRequest(pathname, options) {
  var server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  var address = server.address();
  try {
    var response = await fetch('http://127.0.0.1:' + address.port + pathname, options || {});
    var text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      text: async function() { return text; },
      json: async function() { return JSON.parse(text); }
    };
  } finally {
    await new Promise(function(resolve) { server.close(resolve); });
  }
}

async function withGateway(handler, callback) {
  var gateway = http.createServer(handler);
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  var address = gateway.address();
  try {
    return await callback('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise(function(resolve) { gateway.close(resolve); });
  }
}

function configureMissingConfig() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dualmind-api-missing-'));
  configureTestRuntime({
    dataDir: dir,
    configPath: path.join(dir, 'missing-config.json'),
    adapterFactory: function() {
      return {
        oc: makeMockAdapter('oc'),
        hm: makeMockAdapter('hm')
      };
    }
  });
  return { dir: dir };
}

function parseSse(text) {
  return String(text || '').split(/\n\n/).map(function(chunk) {
    return chunk.split(/\n/).find(function(line) { return line.startsWith('data: '); });
  }).filter(Boolean).map(function(line) {
    var raw = line.slice(6);
    return raw === '[DONE]' ? { t: 'DONE' } : JSON.parse(raw);
  });
}

test.afterEach(function() {
  resetRuntime();
});

test('HTML entry points inject the shared frontend asset version', async function() {
  setup();

  var home = await appRequest('/');
  var setupPage = await appRequest('/setup');
  var homeText = await home.text();
  var setupText = await setupPage.text();

  assert.equal(home.status, 200);
  assert.equal(setupPage.status, 200);
  assert.equal(homeText.includes('/app.js?v=' + ASSET_VERSION), true);
  assert.equal(homeText.includes('/style.css?v=' + ASSET_VERSION), true);
  assert.equal(setupText.includes(".json?v=" + ASSET_VERSION), true);
  assert.doesNotMatch(homeText, /\{\{ASSET_VERSION\}\}/);
  assert.doesNotMatch(setupText, /\{\{ASSET_VERSION\}\}/);
});

test('GET / redirects fresh installs to the setup wizard', async function() {
  configureMissingConfig();

  var home = await appRequest('/', { redirect: 'manual' });
  var setupState = await appRequest('/api/setup/state');
  var body = await setupState.json();

  assert.equal(home.status, 302);
  assert.equal(home.headers.get('location'), '/setup');
  assert.equal(body.needsSetup, true);
  assert.equal(body.hasConfig, false);
});

test('GET / serves the chat UI after setup is complete', async function() {
  setup({ config: { setup: { completed: true, language: 'zh' } } });

  var home = await appRequest('/', { redirect: 'manual' });
  var setupState = await appRequest('/api/setup/state');
  var homeText = await home.text();
  var body = await setupState.json();

  assert.equal(home.status, 200);
  assert.equal(homeText.includes('/app.js?v=' + ASSET_VERSION), true);
  assert.equal(body.needsSetup, false);
  assert.equal(body.hasConfig, true);
});

test('configNeedsSetup treats a missing local config as not ready', function() {
  var ctx = configureMissingConfig();

  assert.equal(configNeedsSetup({}), true);
  assert.equal(configNeedsSetup({ setup: { completed: true } }), true);
  assert.equal(fs.existsSync(path.join(ctx.dir, 'missing-config.json')), false);
});

test('configNeedsSetup respects explicit setup completion once a local config exists', function() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dualmind-api-setup-state-'));
  var configPath = path.join(dir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ setup: { completed: false }, roleMode: 'openclaw-main' }));
  configureTestRuntime({
    dataDir: dir,
    configPath: configPath,
    adapterFactory: function() {
      return {
        oc: makeMockAdapter('oc'),
        hm: makeMockAdapter('hm')
      };
    }
  });

  assert.equal(configNeedsSetup({ setup: { completed: false }, roleMode: 'openclaw-main' }), true);
  assert.equal(configNeedsSetup({ setup: { completed: true } }), false);
});

test('GET /api/status reports normalized role mode and capability schema', async function() {
  setup();

  var res = await appRequest('/api/status');
  var body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.config.roleMode, 'openclaw-main');
  assert.equal(body.capabilities.oc.toolExecution, true);
  assert.equal(body.capabilities.hm.canExecuteFiles, true);
});

test('GET /api/wechat/pair rejects Gateway control page as a WeChat QR link', async function() {
  await withGateway(function(req, res) {
    if (req.url === '/__openclaw__/wechat/pair') {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<!doctype html><title>OpenClaw Control</title><openclaw-app></openclaw-app>');
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  }, async function(gatewayUrl) {
    setup({
      config: { openclaw: { gatewayUrl: gatewayUrl } },
      wechatQrStarter: async function() {
        return { ok: false, status: 'qr-start-failed', error: 'mock no qr' };
      }
    });

    var res = await appRequest('/api/wechat/pair');
    var body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.qrUrl, '');
    assert.equal(body.pairingUrl, '');
    assert.equal(body.status, 'gateway-control-page');
    assert.match(body.error, /control page/i);
  });
});

test('GET /api/wechat/pair preserves Gateway JSON QR payloads', async function() {
  await withGateway(function(req, res) {
    if (req.url === '/__openclaw__/wechat/pair') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ qrUrl: 'https://example.com/wechat.png', expiresAt: 'soon' }));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  }, async function(gatewayUrl) {
    setup({
      config: { openclaw: { gatewayUrl: gatewayUrl } },
      wechatQrStarter: async function() {
        return { ok: false, status: 'qr-start-failed', error: 'mock no qr' };
      }
    });

    var res = await appRequest('/api/wechat/pair');
    var body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.qrUrl, 'https://example.com/wechat.png');
    assert.equal(body.pairingUrl, '');
    assert.equal(body.status, 'qr-ready');
  });
});

test('GET /api/wechat/pair returns official plugin QR image when available', async function() {
  setup({
    wechatQrStarter: async function() {
      return {
        ok: true,
        qrUrl: 'https://liteapp.weixin.qq.com/q/mock',
        qrImage: 'data:image/png;base64,mock',
        pairingUrl: 'https://liteapp.weixin.qq.com/q/mock',
        sessionKey: 'session-1',
        status: 'qr-ready',
        error: ''
      };
    }
  });

  var res = await appRequest('/api/wechat/pair');
  var body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.qrUrl, 'https://liteapp.weixin.qq.com/q/mock');
  assert.equal(body.qrImage, 'data:image/png;base64,mock');
  assert.equal(body.sessionKey, 'session-1');
  assert.equal(body.status, 'qr-ready');
});

test('POST /api/wechat/pair/confirm checks the active official plugin QR session', async function() {
  setup({
    wechatQrWaiter: async function(sessionKey) {
      assert.equal(sessionKey, 'session-1');
      return { ok: true, connected: true, status: 'paired', accountId: 'mock-im-bot', error: '' };
    }
  });

  var res = await appRequest('/api/wechat/pair/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionKey: 'session-1' })
  });
  var body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, 'paired');
});

test('POST /api/chat streams daily group replies and stores turn metadata in history', async function() {
  var ctx = setup({
    oc: {
      onReply: function(input) {
        if (/final public calibration pass/.test(input.prompt || '')) {
          return { ok: true, agent: 'oc', content: 'NO_CORRECTION', streamingMode: 'simulated' };
        }
        return { ok: true, agent: 'oc', content: 'OpenClaw mock', streamingMode: 'simulated' };
      }
    }
  });

  var res = await appRequest('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '你们两个都说一句 ok' }], roleMode: 'openclaw-main' })
  });
  var events = parseSse(await res.text());
  var turnStart = events.find(function(event) { return event.t === 'turnStart'; });
  var turnDone = events.find(function(event) { return event.t === 'turnDone'; });
  var turn = testStores().turnStore.get(turnStart.turnId);
  var historyFile = fs.readdirSync(ctx.dir).find(function(name) { return /^chat-/.test(name); });
  var history = JSON.parse(fs.readFileSync(path.join(ctx.dir, historyFile), 'utf8'));

  assert.equal(res.status, 200);
  assert.equal(turnStart.roleMode, 'openclaw-main');
  assert.equal(turnStart.executor, 'oc');
  assert.equal(turnDone.status, 'done');
  assert.equal(turn.status, 'done');
  assert.equal(turn.messages.filter(function(message) { return message.type === 'agent'; }).length, 2);
  assert.equal(history[0].turnId, turn.id);
  assert.equal(history[1].roleMode, 'openclaw-main');
  assert.equal(ctx.calls.length, 3);
  assert.deepEqual(ctx.calls.map(function(call) { return [call.agent, call.reviewOnly]; }), [['oc', false], ['hm', true], ['oc', false]]);
  assert.match(ctx.calls[2].prompt, /final public calibration pass/);
});

test('POST /api/chat blocks execution when current main AI lacks execution capability', async function() {
  var ctx = setup({
    oc: { capabilities: { toolExecution: false, canExecuteFiles: false, canRunCommands: false, readOnlyMode: true } }
  });

  var res = await appRequest('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '帮我修改 README 文件' }], roleMode: 'openclaw-main' })
  });
  var events = parseSse(await res.text());
  var blocked = events.find(function(event) { return event.t === 'executionBlocked'; });
  var turnStart = events.find(function(event) { return event.t === 'turnStart'; });
  var turn = testStores().turnStore.get(turnStart.turnId);

  assert.equal(res.status, 200);
  assert.equal(blocked.a, 'oc');
  assert.equal(turn.status, 'blocked');
  assert.equal(turn.blockedReason, 'executor-capability-missing');
  assert.equal(ctx.calls.length, 0);
});

test('POST /api/chat requires confirmation before risky execution', async function() {
  var ctx = setup();

  var res = await appRequest('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '请删除临时文件' }], roleMode: 'openclaw-main' })
  });
  var events = parseSse(await res.text());
  var confirm = events.find(function(event) { return event.t === 'confirmRisky'; });
  var turn = testStores().turnStore.get(confirm.turnId);

  assert.equal(res.status, 200);
  assert.equal(confirm.t, 'confirmRisky');
  assert.equal(turn.status, 'needs-confirmation');
  assert.equal(ctx.calls.length, 0);
});

test('POST /api/chat execution turn creates task lease and reviewer uses review-only path', async function() {
  var ctx = setup();

  var res = await appRequest('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '帮我修改 README 文件' }], roleMode: 'openclaw-main' })
  });
  var events = parseSse(await res.text());
  var turnStart = events.find(function(event) { return event.t === 'turnStart'; });
  var lease = events.find(function(event) { return event.t === 'actionLease'; });
  var turnDone = events.find(function(event) { return event.t === 'turnDone'; });
  var turn = testStores().turnStore.get(turnStart.turnId);
  var task = testStores().taskStore.get(lease.taskId);

  assert.equal(res.status, 200);
  assert.equal(turnStart.executor, 'oc');
  assert.equal(lease.lease.owner, 'oc');
  assert.equal(turnDone.status, 'done');
  assert.equal(turn.actionLease.status, 'released');
  assert.equal(task.executor, 'oc');
  assert.equal(task.reviewer, 'hm');
  assert.equal(task.status, 'done');
  assert.deepEqual(ctx.calls.map(function(call) { return [call.agent, call.reviewOnly]; }), [['oc', false], ['hm', true], ['oc', false]]);
});

test('POST /api/chat mention changes execution speaking order but not the executor', async function() {
  var ctx = setup();

  var res = await appRequest('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '@Hermes 你能执行命令吗' }], roleMode: 'openclaw-main' })
  });
  var events = parseSse(await res.text());
  var turnStart = events.find(function(event) { return event.t === 'turnStart'; });
  var lease = events.find(function(event) { return event.t === 'actionLease'; });
  var turn = testStores().turnStore.get(turnStart.turnId);
  var task = testStores().taskStore.get(lease.taskId);

  assert.equal(res.status, 200);
  assert.equal(turnStart.primary, 'hm');
  assert.equal(turnStart.secondary, 'oc');
  assert.equal(turnStart.executor, 'oc');
  assert.equal(lease.lease.owner, 'oc');
  assert.equal(task.executor, 'oc');
  assert.equal(task.reviewer, 'hm');
  assert.deepEqual(ctx.calls.map(function(call) { return [call.agent, call.reviewOnly]; }), [['hm', true], ['oc', false], ['oc', false]]);
  assert.equal(turn.messages.filter(function(message) { return message.type === 'agent'; }).map(function(message) { return message.agent; }).join(','), 'hm,oc,oc');
});

test('POST /api/chat daily chat can add calibration and acknowledgment when correction is needed', async function() {
  var ctx = setup({
    oc: {
      onReply: function(input) {
        if (/final public calibration pass/.test(input.prompt || '')) {
          return { ok: true, agent: 'oc', content: 'Hermes，我纠正一下：现在是早上，不是下午。', streamingMode: 'simulated' };
        }
        return { ok: true, agent: 'oc', content: '早上好', streamingMode: 'simulated' };
      }
    },
    hm: {
      onReply: function(input) {
        if (/corrected or calibrated/.test(input.prompt || '')) {
          return { ok: true, agent: 'hm', content: '理解了，我修正：早上好。', streamingMode: 'simulated' };
        }
        return { ok: true, agent: 'hm', content: '下午好', streamingMode: 'simulated' };
      }
    }
  });

  var res = await appRequest('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], roleMode: 'openclaw-main' })
  });
  var events = parseSse(await res.text());
  var turnStart = events.find(function(event) { return event.t === 'turnStart'; });
  var turn = testStores().turnStore.get(turnStart.turnId);

  assert.equal(res.status, 200);
  assert.deepEqual(ctx.calls.map(function(call) { return [call.agent, call.reviewOnly]; }), [['oc', false], ['hm', true], ['oc', false], ['hm', true]]);
  assert.equal(turn.messages.filter(function(message) { return message.type === 'agent'; }).map(function(message) { return message.agent; }).join(','), 'oc,hm,oc,hm');
});

test('POST /api/chat hides no-correction calibration replies from chat history', async function() {
  var ctx = setup({
    oc: {
      onReply: function(input) {
        if (/final public calibration pass/.test(input.prompt || '')) {
          return { ok: true, agent: 'oc', content: 'NO_CORRECTION', streamingMode: 'simulated' };
        }
        return { ok: true, agent: 'oc', content: 'OpenClaw says hi', streamingMode: 'simulated' };
      }
    },
    hm: {
      onReply: function() {
        return { ok: true, agent: 'hm', content: 'Hermes says hi', streamingMode: 'simulated' };
      }
    }
  });

  var res = await appRequest('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], roleMode: 'openclaw-main' })
  });
  var events = parseSse(await res.text());
  var turnStart = events.find(function(event) { return event.t === 'turnStart'; });
  var turn = testStores().turnStore.get(turnStart.turnId);
  var historyFile = fs.readdirSync(ctx.dir).find(function(name) { return /^chat-/.test(name); });
  var history = JSON.parse(fs.readFileSync(path.join(ctx.dir, historyFile), 'utf8'));

  assert.equal(res.status, 200);
  assert.deepEqual(ctx.calls.map(function(call) { return [call.agent, call.reviewOnly]; }), [['oc', false], ['hm', true], ['oc', false]]);
  assert.equal(turn.messages.filter(function(message) { return message.type === 'agent'; }).length, 2);
  assert.equal(history.some(function(message) { return message.c === 'NO_CORRECTION'; }), false);
});

test('turn retry endpoint returns original message and role mode', async function() {
  setup();
  var chat = await appRequest('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello retry' }], roleMode: 'hermes-main' })
  });
  var events = parseSse(await chat.text());
  var turnStart = events.find(function(event) { return event.t === 'turnStart'; });

  var retry = await appRequest('/api/turns/' + encodeURIComponent(turnStart.turnId) + '/retry', { method: 'POST' });
  var body = await retry.json();

  assert.equal(retry.status, 200);
  assert.equal(body.message, 'hello retry');
  assert.equal(body.roleMode, 'hermes-main');
});
