const fs = require('fs');
const path = require('path');

function dateKey(now) {
  var d = now ? new Date(now) : new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function makeId(now) {
  var stamp = Number(now || Date.now()).toString(36);
  var suffix = Math.random().toString(36).slice(2, 8);
  return 'turn-' + stamp + '-' + suffix;
}

function safeReadJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {}
  return fallback;
}

class TurnStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
  }

  ensureDir() {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  filePathForDate(key) {
    return path.join(this.dataDir, 'turns-' + key + '.json');
  }

  filePathForTurn(turn) {
    return this.filePathForDate(dateKey(turn.startedAt));
  }

  readTurns(filePath) {
    var value = safeReadJson(filePath, []);
    return Array.isArray(value) ? value : [];
  }

  writeTurns(filePath, turns) {
    this.ensureDir();
    fs.writeFileSync(filePath, JSON.stringify(turns, null, 2));
  }

  create(input) {
    input = input || {};
    var now = input.now || Date.now();
    var turn = {
      id: input.id || makeId(now),
      status: 'running',
      startedAt: now,
      finishedAt: null,
      durationMs: null,
      roleMode: input.roleMode || 'openclaw-main',
      intent: input.intent || 'casual',
      mentioned: input.mentioned || null,
      executor: input.executor || null,
      primary: input.primary || null,
      secondary: input.secondary || null,
      source: input.source || 'web',
      remoteUser: input.remoteUser || '',
      lockAcquired: !!input.lockAcquired,
      actionLease: input.actionLease || null,
      policyWarnings: [],
      userMessage: String(input.userMessage || ''),
      intentDetails: input.intentDetails || null,
      discussionPlan: input.discussionPlan || null,
      agentStates: input.agentStates || {},
      messages: [],
      events: []
    };

    var filePath = this.filePathForTurn(turn);
    var turns = this.readTurns(filePath);
    turns.push(turn);
    this.writeTurns(filePath, turns);
    return turn;
  }

  update(id, updater) {
    var files = this.turnFiles();
    for (var f = 0; f < files.length; f++) {
      var filePath = files[f];
      var turns = this.readTurns(filePath);
      var changed = false;
      for (var i = 0; i < turns.length; i++) {
        if (turns[i].id === id) {
          updater(turns[i]);
          changed = true;
          break;
        }
      }
      if (changed) {
        this.writeTurns(filePath, turns);
        return turns.find(function(turn) { return turn.id === id; }) || null;
      }
    }
    return null;
  }

  addEvent(id, event) {
    return this.update(id, function(turn) {
      if (!Array.isArray(turn.events)) turn.events = [];
      turn.events.push(Object.assign({ ts: Date.now() }, event || {}));
    });
  }

  addMessage(id, message) {
    return this.update(id, function(turn) {
      if (!Array.isArray(turn.messages)) turn.messages = [];
      turn.messages.push(Object.assign({ ts: Date.now() }, message || {}));
    });
  }

  addPolicyWarning(id, warning) {
    return this.update(id, function(turn) {
      var item = Object.assign({ ts: Date.now() }, warning || {});
      if (!Array.isArray(turn.policyWarnings)) turn.policyWarnings = [];
      if (!Array.isArray(turn.events)) turn.events = [];
      turn.policyWarnings.push(item);
      turn.events.push({
        ts: item.ts,
        type: 'policyWarning',
        agent: item.agent || '',
        executor: item.executor || '',
        reason: item.reason || '',
        claim: item.claims && item.claims[0] ? item.claims[0].text : ''
      });
    });
  }

  setAgentState(id, agent, state, extra) {
    return this.update(id, function(turn) {
      if (!agent) return;
      if (!turn.agentStates || typeof turn.agentStates !== 'object') turn.agentStates = {};
      turn.agentStates[agent] = Object.assign({}, turn.agentStates[agent] || {}, extra || {}, {
        state: state || 'idle',
        updatedAt: Date.now()
      });
    });
  }

  updateActionLease(id, patch) {
    return this.update(id, function(turn) {
      if (!turn.actionLease) return;
      turn.actionLease = Object.assign({}, turn.actionLease, patch || {});
    });
  }

  finish(id, status, extra) {
    return this.update(id, function(turn) {
      var now = Date.now();
      turn.status = status || 'done';
      turn.finishedAt = now;
      turn.durationMs = Math.max(0, now - Number(turn.startedAt || now));
      if (extra && typeof extra === 'object') Object.assign(turn, extra);
    });
  }

  get(id) {
    var files = this.turnFiles();
    for (var f = 0; f < files.length; f++) {
      var found = this.readTurns(files[f]).find(function(turn) { return turn.id === id; });
      if (found) return found;
    }
    return null;
  }

  list(limit, filters) {
    filters = filters || {};
    limit = Number(limit || 50);
    var turns = [];
    var files = this.turnFiles();
    for (var f = 0; f < files.length; f++) {
      turns = turns.concat(this.readTurns(files[f]));
    }
    return turns.filter(function(turn) {
      if (filters.status && turn.status !== filters.status) return false;
      if (filters.intent && turn.intent !== filters.intent) return false;
      if (filters.source && (turn.source || 'web') !== filters.source) return false;
      if (filters.executor && (turn.executor || '') !== filters.executor) return false;
      return true;
    })
      .sort(function(a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); })
      .slice(0, Math.max(1, Math.min(200, limit)));
  }

  turnFiles() {
    this.ensureDir();
    return fs.readdirSync(this.dataDir)
      .filter(function(name) { return /^turns-\d{4}-\d{2}-\d{2}\.json$/.test(name); })
      .sort()
      .map(function(name) { return path.join(this.dataDir, name); }, this);
  }
}

module.exports = {
  TurnStore,
  dateKey
};
