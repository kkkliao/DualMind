function defaultAgentName(agent) {
  return agent === 'hm' ? 'Hermes' : 'OpenClaw';
}

function intentNeedsExecutor(intent) {
  return intent === 'coding' || intent === 'risky';
}

function compactScope(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function boundedTtl(value) {
  var ttl = Number(value || 10 * 60 * 1000);
  if (!Number.isFinite(ttl)) ttl = 10 * 60 * 1000;
  return Math.max(30 * 1000, Math.min(30 * 60 * 1000, Math.floor(ttl)));
}

function makeLeaseId(now) {
  return 'lease-' + Number(now || Date.now()).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function createActionLease(holder, intent, userMsg, options) {
  if (!holder || !intentNeedsExecutor(intent)) return null;
  options = options || {};
  var now = Number(options.now || Date.now());
  var ttlMs = boundedTtl(options.ttlMs);
  return {
    id: options.id || makeLeaseId(now),
    owner: holder,
    agent: holder,
    intent: intent,
    scope: compactScope(userMsg),
    startedAt: now,
    expiresAt: now + ttlMs,
    status: 'active'
  };
}

class ExecutionLockManager {
  constructor(agentName) {
    this.agentName = agentName || defaultAgentName;
    this.lock = null;
  }

  acquire(holder, intent, userMsg, options) {
    if (!holder || !intentNeedsExecutor(intent)) return { ok: true, acquired: false };
    if (this.lock) {
      return {
        ok: false,
        acquired: false,
        error: this.agentName(this.lock.agent) + ' is already holding the execution lock. Wait for that turn to finish before starting another code or command task.'
      };
    }

    var lease = createActionLease(holder, intent, userMsg, options);
    this.lock = {
      agent: holder,
      intent: intent,
      startedAt: lease.startedAt,
      expiresAt: lease.expiresAt,
      leaseId: lease.id,
      excerpt: lease.scope
    };

    return { ok: true, acquired: true, lock: Object.assign({}, this.lock), lease: Object.assign({}, lease) };
  }

  release(holder) {
    if (this.lock && this.lock.agent === holder) this.lock = null;
  }

  current() {
    return this.lock ? Object.assign({}, this.lock) : null;
  }

  reset() {
    this.lock = null;
  }
}

module.exports = {
  ExecutionLockManager,
  createActionLease,
  intentNeedsExecutor
};
