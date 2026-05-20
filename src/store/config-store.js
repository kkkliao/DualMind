const fs = require('fs');

class ConfigStore {
  constructor(configPath) {
    this.configPath = configPath;
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch {}
    return {};
  }

  save(config) {
    fs.writeFileSync(this.configPath, JSON.stringify(config || {}, null, 2));
  }

  publicConfig(config) {
    var copy = JSON.parse(JSON.stringify(config || {}));
    if (copy.openclaw) delete copy.openclaw.apiToken;
    if (copy.wechat) {
      delete copy.wechat.appSecret;
      delete copy.wechat.token;
      delete copy.wechat.aesKey;
    }
    return copy;
  }
}

module.exports = {
  ConfigStore
};
