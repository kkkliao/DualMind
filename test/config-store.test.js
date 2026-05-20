const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ConfigStore } = require('../src/store/config-store');

test('config store loads, saves, and redacts public config', function() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dualmind-config-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);

  assert.deepEqual(store.load(), {});
  store.save({
    openclaw: { apiToken: 'secret', gatewayUrl: 'http://127.0.0.1:18789' },
    wechat: { appSecret: 'secret', token: 'token', aesKey: 'aes', enabled: true }
  });

  assert.equal(store.load().openclaw.apiToken, 'secret');
  const publicConfig = store.publicConfig(store.load());
  assert.equal(publicConfig.openclaw.apiToken, undefined);
  assert.equal(publicConfig.wechat.appSecret, undefined);
  assert.equal(publicConfig.wechat.token, undefined);
  assert.equal(publicConfig.wechat.aesKey, undefined);
  assert.equal(publicConfig.wechat.enabled, true);
});
