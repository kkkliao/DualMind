const { sse } = require('./sse-writer');

function boundedNumber(value, fallback, min, max) {
  var number = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(number)) number = fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

async function streamText(res, agent, text, done, options) {
  options = options || {};
  var value = String(text || '');
  var chunkSize = boundedNumber(options.chunkSize, 40, 8, 240);
  var delayMs = boundedNumber(options.delayMs, 18, 0, 250);
  for (var i = 0; i < value.length; i += chunkSize) {
    sse(res, { t: 'c', a: agent, d: value.substring(i, i + chunkSize), f: false });
    if (delayMs > 0) await new Promise(function(resolve) { setTimeout(resolve, delayMs); });
  }
  if (done) sse(res, { t: 'c', a: agent, d: '', f: true });
}

async function waitForMinThinking(startedAt, config) {
  var collab = (config && config.collaboration) || {};
  var minMs = boundedNumber(collab.minThinkingMs, 400, 0, 3000);
  var remaining = minMs - (Date.now() - Number(startedAt || Date.now()));
  if (remaining > 0) {
    await new Promise(function(resolve) { setTimeout(resolve, remaining); });
  }
}

module.exports = {
  streamText,
  waitForMinThinking
};
