const CONFIG_KEY = 'apiConfig';

const defaultConfig = {
  model: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
  apiKey: ''
};

const config = {
  // 获取配置
  getConfig() {
    try {
      const savedConfig = wx.getStorageSync(CONFIG_KEY);
      return savedConfig ? JSON.parse(savedConfig) : defaultConfig;
    } catch (e) {
      console.error('获取配置失败:', e);
      return defaultConfig;
    }
  },

  // 保存配置
  saveConfig(newConfig) {
    try {
      wx.setStorageSync(CONFIG_KEY, JSON.stringify({
        ...defaultConfig,
        ...newConfig
      }));
      return true;
    } catch (e) {
      console.error('保存配置失败:', e);
      return false;
    }
  }
};

module.exports = config;