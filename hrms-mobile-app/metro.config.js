const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Configure watcher options for network drives / SMB shares
config.watcher = {
  healthCheck: {
    enabled: true,
  },
  watchman: false,
};

module.exports = config;
