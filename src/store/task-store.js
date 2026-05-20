const fs = require('fs');
const path = require('path');

function makeTaskId(now) {
  var stamp = Number(now || Date.now()).toString(36);
  var suffix = Math.random().toString(36).slice(2, 8);
  return 'task-' + stamp + '-' + suffix;
}

function safeReadJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {}
  return fallback;
}

class TaskStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
  }

  ensureDir() {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  filePath() {
    return path.join(this.dataDir, 'tasks.json');
  }

  readTasks() {
    var value = safeReadJson(this.filePath(), []);
    return Array.isArray(value) ? value : [];
  }

  writeTasks(tasks) {
    this.ensureDir();
    fs.writeFileSync(this.filePath(), JSON.stringify(tasks, null, 2));
  }

  create(input) {
    input = input || {};
    var now = input.now || Date.now();
    var task = {
      id: input.id || makeTaskId(now),
      turnId: input.turnId || '',
      status: input.status || 'planned',
      intent: input.intent || 'coding',
      executor: input.executor || null,
      reviewer: input.reviewer || null,
      roleMode: input.roleMode || 'openclaw-main',
      source: input.source || 'web',
      userMessage: String(input.userMessage || ''),
      leaseId: input.leaseId || '',
      capabilities: input.capabilities || null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      error: '',
      events: []
    };
    var tasks = this.readTasks();
    tasks.push(task);
    this.writeTasks(tasks);
    return task;
  }

  update(id, updater) {
    var tasks = this.readTasks();
    var changed = false;
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) {
        updater(tasks[i]);
        tasks[i].updatedAt = Date.now();
        changed = true;
        break;
      }
    }
    if (!changed) return null;
    this.writeTasks(tasks);
    return tasks.find(function(task) { return task.id === id; }) || null;
  }

  addEvent(id, event) {
    return this.update(id, function(task) {
      if (!Array.isArray(task.events)) task.events = [];
      task.events.push(Object.assign({ ts: Date.now() }, event || {}));
    });
  }

  finish(id, status, extra) {
    return this.update(id, function(task) {
      task.status = status || 'done';
      task.finishedAt = Date.now();
      if (extra && typeof extra === 'object') Object.assign(task, extra);
    });
  }

  get(id) {
    return this.readTasks().find(function(task) { return task.id === id; }) || null;
  }

  list(limit, filters) {
    filters = filters || {};
    limit = Number(limit || 50);
    return this.readTasks().filter(function(task) {
      if (filters.status && task.status !== filters.status) return false;
      if (filters.executor && task.executor !== filters.executor) return false;
      if (filters.source && task.source !== filters.source) return false;
      return true;
    }).sort(function(a, b) {
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    }).slice(0, Math.max(1, Math.min(200, limit)));
  }
}

module.exports = {
  TaskStore,
  makeTaskId
};
