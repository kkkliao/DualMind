const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { NonceStore, normalizeWechatPairPayload, parseWechatXml, queueWechatMessage, wechatReplayValid, wechatSignatureValid, wechatTimestampFresh } = require('../src/channels/wechat-channel');
const { TurnStore } = require('../src/store/turn-store');

test('wechat signature validation follows token timestamp nonce sha1', function() {
  const token = 'abc';
  const timestamp = '123';
  const nonce = 'xyz';
  const signature = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');

  assert.equal(wechatSignatureValid({ signature, timestamp, nonce }, token), true);
  assert.equal(wechatSignatureValid({ signature: 'bad', timestamp, nonce }, token), false);
  assert.equal(wechatSignatureValid({}, ''), true);
});

test('wechat replay guard rejects stale timestamps and repeated nonces', function() {
  const now = new Date('2026-05-19T10:00:00Z').getTime();
  const freshSeconds = Math.floor(now / 1000);
  const store = new NonceStore(5 * 60 * 1000);

  assert.equal(wechatTimestampFresh(String(freshSeconds), now), true);
  assert.equal(wechatTimestampFresh(String(freshSeconds - 600), now), false);

  const query = { timestamp: String(freshSeconds), nonce: 'abc', signature: 'sig' };
  assert.deepEqual(wechatReplayValid(query, store, { nowMs: now }), { ok: true, reason: '' });
  assert.equal(wechatReplayValid(query, store, { nowMs: now + 1000 }).ok, false);
  assert.equal(wechatReplayValid({ timestamp: String(freshSeconds - 600), nonce: 'x', signature: 'y' }, store, { nowMs: now }).reason, 'stale-timestamp');
});

test('wechat xml parser extracts cdata and plain fields', function() {
  const parsed = parseWechatXml('<xml><FromUserName><![CDATA[user-a]]></FromUserName><Content>hello</Content><MsgType><![CDATA[text]]></MsgType></xml>');

  assert.equal(parsed.fromUserName, 'user-a');
  assert.equal(parsed.content, 'hello');
  assert.equal(parsed.msgType, 'text');
});

test('wechat pairing payload separates QR and pairing URLs', function() {
  const qr = normalizeWechatPairPayload({ url: 'https://example.com/pair.png' }, 'http://127.0.0.1:18789');
  assert.equal(qr.ok, true);
  assert.equal(qr.qrUrl, 'https://example.com/pair.png');
  assert.equal(qr.pairingUrl, '');

  const pair = normalizeWechatPairPayload({ pairing_url: 'https://example.com/pair' }, 'http://127.0.0.1:18789');
  assert.equal(pair.ok, true);
  assert.equal(pair.qrUrl, '');
  assert.equal(pair.pairingUrl, 'https://example.com/pair');

  const missing = normalizeWechatPairPayload({ url: 'not a url' }, 'http://127.0.0.1:18789');
  assert.equal(missing.ok, false);
});

test('wechat queued message creates a queued turn with remote metadata', function() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dualmind-wechat-'));
  const store = new TurnStore(dir);

  const turn = queueWechatMessage(store, { roleMode: 'hermes-main' }, { fromUserName: 'wx-user', content: 'hello' }, 'casual');
  const loaded = store.get(turn.id);

  assert.equal(loaded.status, 'queued');
  assert.equal(loaded.roleMode, 'hermes-main');
  assert.equal(loaded.executor, 'hm');
  assert.equal(loaded.primary, 'hm');
  assert.equal(loaded.secondary, 'oc');
  assert.equal(loaded.source, 'wechat');
  assert.equal(loaded.remoteUser, 'wx-user');
  assert.equal(loaded.messages[0].content, 'hello');
  assert.equal(loaded.events[0].type, 'remoteMessageQueued');
});
