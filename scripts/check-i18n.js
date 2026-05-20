const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'public', 'i18n');
const LANGS = ['zh', 'en'];
const { ROLE_MODES } = require(path.join(ROOT, 'src', 'coordinator', 'roles'));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenKeys(value, prefix) {
  prefix = prefix || '';
  var keys = [];
  Object.keys(value || {}).forEach(function(key) {
    var next = prefix ? prefix + '.' + key : key;
    if (value[key] && typeof value[key] === 'object' && !Array.isArray(value[key])) {
      keys = keys.concat(flattenKeys(value[key], next));
    } else {
      keys.push(next);
    }
  });
  return keys;
}

function collectUsedKeys() {
  var files = [
    path.join(ROOT, 'public', 'index.html'),
    path.join(ROOT, 'public', 'setup.html'),
    path.join(ROOT, 'public', 'app.js')
  ];
  var keys = new Set();
  files.forEach(function(filePath) {
    var text = fs.readFileSync(filePath, 'utf8');
    var patterns = [
      /data-i18n(?:-html|-title)?="([^"]+)"/g,
      /data-setup-i18n="([^"]+)"/g,
      /tr\('([^']+)'\)/g,
      /tr\("([^"]+)"\)/g
    ];
    patterns.forEach(function(regex) {
      var match;
      while ((match = regex.exec(text))) keys.add(match[1]);
    });
  });
  return Array.from(keys).sort();
}

var dictionaries = {};
LANGS.forEach(function(lang) {
  dictionaries[lang] = readJson(path.join(LANG_DIR, lang + '.json'));
});

var flat = {};
LANGS.forEach(function(lang) {
  flat[lang] = new Set(flattenKeys(dictionaries[lang]));
});

var errors = [];
LANGS.forEach(function(lang) {
  LANGS.forEach(function(other) {
    flat[other].forEach(function(key) {
      if (!flat[lang].has(key)) errors.push(lang + ' missing key: ' + key);
    });
  });
});

collectUsedKeys().forEach(function(key) {
  LANGS.forEach(function(lang) {
    if (!flat[lang].has(key)) errors.push(lang + ' missing used key: ' + key);
  });
});

LANGS.forEach(function(lang) {
  var roleOptions = dictionaries[lang].roleOptions || {};
  Object.keys(ROLE_MODES).forEach(function(mode) {
    if (!roleOptions[mode]) errors.push(lang + ' missing role option: ' + mode);
  });
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('i18n ok: ' + LANGS.join(', '));
