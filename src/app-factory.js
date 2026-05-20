const express = require('express');
const path = require('path');

function createDualMindApp(options) {
  options = options || {};
  var app = express();
  var publicDir = options.publicDir || path.join(__dirname, '..', 'public');

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.text({ type: ['text/xml', 'application/xml', 'text/plain'], limit: '1mb' }));
  app.use(express.static(publicDir, { index: false }));

  return app;
}

module.exports = {
  createDualMindApp
};
