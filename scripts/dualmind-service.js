#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LABEL = 'local.dualmind.server';
const PLIST_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = path.join(PLIST_DIR, LABEL + '.plist');
const LOG_DIR = path.join(ROOT, 'data', 'logs');
const NODE = process.execPath;

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function plist() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    '  <string>' + LABEL + '</string>',
    '  <key>ProgramArguments</key>',
    '  <array>',
    '    <string>' + xmlEscape(NODE) + '</string>',
    '    <string>' + xmlEscape(path.join(ROOT, 'server.js')) + '</string>',
    '  </array>',
    '  <key>WorkingDirectory</key>',
    '  <string>' + xmlEscape(ROOT) + '</string>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <true/>',
    '  <key>StandardOutPath</key>',
    '  <string>' + xmlEscape(path.join(LOG_DIR, 'dualmind.out.log')) + '</string>',
    '  <key>StandardErrorPath</key>',
    '  <string>' + xmlEscape(path.join(LOG_DIR, 'dualmind.err.log')) + '</string>',
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    '    <key>PATH</key>',
    '    <string>' + xmlEscape(process.env.PATH || '') + '</string>',
    '  </dict>',
    '</dict>',
    '</plist>'
  ].join('\n') + '\n';
}

function run(command, args, options) {
  var result = spawnSync(command, args, Object.assign({ encoding: 'utf8' }, options || {}));
  if (result.error) throw result.error;
  return result;
}

function launchctl(args) {
  return run('launchctl', args);
}

function ensureDirs() {
  fs.mkdirSync(PLIST_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function install() {
  ensureDirs();
  fs.writeFileSync(PLIST_PATH, plist());
  launchctl(['bootout', 'gui/' + process.getuid(), PLIST_PATH]);
  launchctl(['bootstrap', 'gui/' + process.getuid(), PLIST_PATH]);
  launchctl(['enable', 'gui/' + process.getuid() + '/' + LABEL]);
  launchctl(['kickstart', '-k', 'gui/' + process.getuid() + '/' + LABEL]);
  console.log('DualMind service installed and started.');
  console.log('Label: ' + LABEL);
  console.log('Plist: ' + PLIST_PATH);
}

function start() {
  if (!fs.existsSync(PLIST_PATH)) install();
  else {
    launchctl(['bootstrap', 'gui/' + process.getuid(), PLIST_PATH]);
    launchctl(['kickstart', '-k', 'gui/' + process.getuid() + '/' + LABEL]);
    console.log('DualMind service started.');
  }
}

function stop() {
  launchctl(['bootout', 'gui/' + process.getuid(), PLIST_PATH]);
  console.log('DualMind service stopped.');
}

function uninstall() {
  stop();
  try { fs.unlinkSync(PLIST_PATH); } catch {}
  console.log('DualMind service uninstalled.');
}

function status() {
  var result = launchctl(['print', 'gui/' + process.getuid() + '/' + LABEL]);
  if (result.status === 0) {
    console.log(result.stdout.trim() || 'DualMind service is loaded.');
    return;
  }
  console.log('DualMind service is not loaded.');
  if (fs.existsSync(PLIST_PATH)) console.log('Plist exists: ' + PLIST_PATH);
}

function usage() {
  console.log('Usage: node scripts/dualmind-service.js <install|start|stop|restart|status|uninstall>');
}

var command = process.argv[2] || 'status';
try {
  if (command === 'install') install();
  else if (command === 'start') start();
  else if (command === 'stop') stop();
  else if (command === 'restart') {
    try { stop(); } catch {}
    start();
  } else if (command === 'status') status();
  else if (command === 'uninstall') uninstall();
  else {
    usage();
    process.exit(1);
  }
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}
