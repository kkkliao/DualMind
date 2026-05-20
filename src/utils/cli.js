const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function expandHome(value) {
  if (!value || typeof value !== 'string') return value;
  if (value === '~') return process.env.HOME || value;
  if (value.startsWith('~/')) return path.join(process.env.HOME || '', value.slice(2));
  return value;
}

function isExecutable(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findOnPath(name) {
  var dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (var i = 0; i < dirs.length; i++) {
    var candidate = path.join(dirs[i], name);
    if (isExecutable(candidate)) return candidate;
  }
  return '';
}

function resolveBinary(configuredPath, fallbacks, commandName) {
  var candidates = [];
  if (configuredPath) candidates.push(configuredPath);
  if (process.env[commandName.toUpperCase() + '_BIN']) candidates.push(process.env[commandName.toUpperCase() + '_BIN']);
  if (Array.isArray(fallbacks)) candidates = candidates.concat(fallbacks);

  for (var i = 0; i < candidates.length; i++) {
    var candidate = expandHome(candidates[i]);
    if (isExecutable(candidate)) return candidate;
  }

  return findOnPath(commandName);
}

function runCli(bin, args, options) {
  options = options || {};
  return new Promise(function(resolve) {
    if (!bin) {
      resolve({ ok: false, code: -1, stdout: '', stderr: 'Executable not found' });
      return;
    }

    var child;
    var stdout = '';
    var stderr = '';
    var settled = false;
    var timeoutMs = options.timeoutMs || 120000;

    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    }

    try {
      child = spawn(bin, args, {
        cwd: options.cwd || process.cwd(),
        env: Object.assign({}, process.env, options.env || {}),
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (err) {
      finish({ ok: false, code: -1, stdout: '', stderr: err.message || String(err) });
      return;
    }

    var timer = setTimeout(function() {
      try { child.kill('SIGTERM'); } catch {}
      finish({ ok: false, code: -1, stdout: stdout, stderr: 'Command timed out after ' + timeoutMs + 'ms' });
    }, timeoutMs);

    child.stdout.on('data', function(chunk) {
      var text = chunk.toString('utf8');
      stdout += text;
      if (typeof options.onStdout === 'function') options.onStdout(text);
    });
    child.stderr.on('data', function(chunk) {
      var text = chunk.toString('utf8');
      stderr += text;
      if (typeof options.onStderr === 'function') options.onStderr(text);
    });
    child.on('error', function(err) {
      finish({ ok: false, code: -1, stdout: stdout, stderr: err.message || String(err) });
    });
    child.on('close', function(code) {
      finish({ ok: code === 0, code: code, stdout: stdout, stderr: stderr });
    });
  });
}

function stripAnsi(text) {
  return String(text || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function parseJsonOutput(raw) {
  var cleaned = stripAnsi(raw).trim();
  if (!cleaned) return null;
  try { return JSON.parse(cleaned); } catch {}

  var lines = cleaned.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean);
  for (var i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }

  return null;
}

function valueAtPath(root, pathParts) {
  var current = root;
  for (var i = 0; i < pathParts.length; i++) {
    if (current == null) return undefined;
    current = current[pathParts[i]];
  }
  return current;
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r/g, '').trim();
}

function extractTextFromJson(json, depth) {
  if (json == null) return '';
  depth = depth || 0;
  if (depth > 4) return '';
  if (typeof json === 'string') return normalizeText(json);

  if (Array.isArray(json)) {
    var collected = [];
    for (var i = 0; i < json.length; i++) {
      var itemText = extractTextFromJson(json[i], depth + 1);
      if (itemText) collected.push(itemText);
    }
    return collected.join('\n').trim();
  }

  if (typeof json !== 'object') return '';

  var preferredPaths = [
    ['outputs', 0, 'text'],
    ['outputs', 0, 'content'],
    ['outputs', 0, 'output'],
    ['result', 'payloads', 0, 'text'],
    ['result', 'payloads', 0, 'content'],
    ['result', 'payloads', 0, 'output'],
    ['result', 'outputs', 0, 'text'],
    ['result', 'outputs', 0, 'content'],
    ['result', 'finalAssistantVisibleText'],
    ['result', 'finalAssistantRawText'],
    ['payloads', 0, 'text'],
    ['payloads', 0, 'content'],
    ['choices', 0, 'message', 'content'],
    ['choices', 0, 'text'],
    ['message', 'content'],
    ['reply'],
    ['response'],
    ['answer'],
    ['content'],
    ['text'],
    ['output'],
    ['finalAssistantVisibleText'],
    ['finalAssistantRawText']
  ];

  for (var p = 0; p < preferredPaths.length; p++) {
    var value = valueAtPath(json, preferredPaths[p]);
    var directText = extractTextFromJson(value, depth + 1);
    if (directText) return directText;
  }

  var arrayKeys = ['outputs', 'payloads', 'messages', 'content'];
  for (var a = 0; a < arrayKeys.length; a++) {
    if (Array.isArray(json[arrayKeys[a]])) {
      var arrayText = extractTextFromJson(json[arrayKeys[a]], depth + 1);
      if (arrayText) return arrayText;
    }
  }

  return '';
}

function cleanAgentOutput(raw) {
  var cleaned = stripAnsi(raw || '').replace(/\r/g, '').trim();
  if (!cleaned) return '';

  var json = parseJsonOutput(cleaned);
  if (json) {
    return extractTextFromJson(json);
  }

  var boxStart = cleaned.indexOf('\u256D');
  var boxEnd = cleaned.lastIndexOf('\u2570');
  if (boxStart >= 0 && boxEnd > boxStart) {
    var inner = cleaned.substring(boxStart, boxEnd + 1);
    var firstBreak = inner.indexOf('\n');
    if (firstBreak > 0) inner = inner.substring(firstBreak + 1);
    var lastBreak = inner.lastIndexOf('\n');
    if (lastBreak > 0) inner = inner.substring(0, lastBreak);
    inner = inner.replace(/^    /gm, '').trim();
    if (inner) return inner;
  }

  return cleaned
    .replace(/^Query:.*$/gm, '')
    .replace(/^Initializing agent.*$/gm, '')
    .replace(/^Resume this session.*$/gm, '')
    .replace(/^[─╭╰│].*$/gm, '')
    .trim();
}

module.exports = {
  cleanAgentOutput,
  expandHome,
  extractTextFromJson,
  findOnPath,
  parseJsonOutput,
  resolveBinary,
  runCli
};
