const crypto = require('crypto');
const { getRoleMode, normalizeRoleMode } = require('../coordinator/roles');

function validHttpUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    var url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function wechatToken(config) {
  return String(config && config.wechat && config.wechat.token ? config.wechat.token : '').trim();
}

function wechatSignatureValid(query, token) {
  if (!token) return true;
  var signature = String(query && query.signature ? query.signature : '').trim();
  var timestamp = String(query && query.timestamp ? query.timestamp : '').trim();
  var nonce = String(query && query.nonce ? query.nonce : '').trim();
  if (!signature || !timestamp || !nonce) return false;
  var hash = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
  return hash === signature;
}

function wechatTimestampFresh(timestamp, nowMs, maxSkewMs) {
  if (!timestamp) return false;
  var value = Number(timestamp);
  if (!Number.isFinite(value)) return false;
  var tsMs = value < 100000000000 ? value * 1000 : value;
  var now = Number(nowMs || Date.now());
  var skew = Number(maxSkewMs || 5 * 60 * 1000);
  return Math.abs(now - tsMs) <= skew;
}

class NonceStore {
  constructor(ttlMs) {
    this.ttlMs = Number(ttlMs || 5 * 60 * 1000);
    this.items = new Map();
  }

  seen(key, nowMs) {
    var now = Number(nowMs || Date.now());
    this.prune(now);
    if (!key) return false;
    if (this.items.has(key)) return true;
    this.items.set(key, now + this.ttlMs);
    return false;
  }

  prune(nowMs) {
    var now = Number(nowMs || Date.now());
    Array.from(this.items.entries()).forEach(function(entry) {
      if (entry[1] <= now) this.items.delete(entry[0]);
    }, this);
  }
}

function wechatReplayValid(query, nonceStore, options) {
  options = options || {};
  var timestamp = String(query && query.timestamp ? query.timestamp : '').trim();
  var nonce = String(query && query.nonce ? query.nonce : '').trim();
  var signature = String(query && query.signature ? query.signature : '').trim();
  if (!wechatTimestampFresh(timestamp, options.nowMs, options.maxSkewMs)) {
    return { ok: false, reason: 'stale-timestamp' };
  }
  var key = [timestamp, nonce, signature].join(':');
  if (nonceStore && nonceStore.seen(key, options.nowMs)) {
    return { ok: false, reason: 'replay-detected' };
  }
  return { ok: true, reason: '' };
}

function parseWechatXml(text) {
  var source = String(text || '');
  function capture(tag) {
    var match = source.match(new RegExp('<' + tag + '><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></' + tag + '>|<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i'));
    return match ? (match[1] || match[2] || '').trim() : '';
  }
  return {
    msgType: capture('MsgType'),
    fromUserName: capture('FromUserName'),
    toUserName: capture('ToUserName'),
    content: capture('Content'),
    event: capture('Event'),
    eventKey: capture('EventKey'),
    raw: source
  };
}

function queueWechatMessage(turnStore, config, payload, intent) {
  var roleMode = normalizeRoleMode(config.roleMode);
  var mode = getRoleMode(roleMode);
  var turn = turnStore.create({
    roleMode: roleMode,
    intent: intent,
    mentioned: null,
    executor: mode.executor,
    primary: mode.executor,
    secondary: mode.reviewer,
    source: 'wechat',
    remoteUser: payload.fromUserName || '',
    lockAcquired: false,
    userMessage: payload.content || ''
  });
  turnStore.addMessage(turn.id, {
    type: 'user',
    agent: 'user',
    source: 'wechat',
    remoteUser: payload.fromUserName || '',
    content: payload.content || ''
  });
  turnStore.addEvent(turn.id, {
    type: 'remoteMessageQueued',
    source: 'wechat',
    remoteUser: payload.fromUserName || ''
  });
  turnStore.update(turn.id, function(value) {
    value.status = 'queued';
  });
  return turnStore.get(turn.id) || turn;
}

function firstString(values) {
  for (var i = 0; i < values.length; i++) {
    if (typeof values[i] === 'string' && values[i].trim()) return values[i].trim();
  }
  return '';
}

function normalizeWechatPairPayload(data, gatewayUrl) {
  data = data || {};
  var qrCandidate = firstString([
    data.qrUrl,
    data.qr_url,
    data.qrcodeUrl,
    data.qrcode_url,
    data.qrCodeUrl,
    data.qr_code_url,
    data.qrcode
  ]);
  var pairCandidate = firstString([
    data.pairingUrl,
    data.pairing_url,
    data.pairUrl,
    data.pair_url,
    data.authUrl,
    data.auth_url,
    data.url
  ]);

  var qrUrl = validHttpUrl(qrCandidate);
  var pairingUrl = validHttpUrl(pairCandidate);
  if (!qrUrl && pairingUrl && /\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(pairingUrl)) {
    qrUrl = pairingUrl;
    pairingUrl = '';
  }

  if (!qrUrl && !pairingUrl) {
    return {
      ok: false,
      qrUrl: '',
      pairingUrl: '',
      gatewayUrl: gatewayUrl,
      status: 'no-pairing-url',
      error: 'OpenClaw Gateway responded, but did not provide a valid WeChat QR or pairing URL.'
    };
  }

  return {
    ok: true,
    qrUrl: qrUrl,
    pairingUrl: pairingUrl,
    gatewayUrl: gatewayUrl,
    expiresAt: data.expiresAt || data.expires_at || null,
    status: qrUrl ? 'qr-ready' : 'pairing-ready',
    error: ''
  };
}

module.exports = {
  normalizeWechatPairPayload,
  NonceStore,
  parseWechatXml,
  queueWechatMessage,
  validHttpUrl,
  wechatReplayValid,
  wechatSignatureValid,
  wechatTimestampFresh,
  wechatToken
};
