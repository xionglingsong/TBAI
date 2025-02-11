const config = require('../../utils/config');

Page({
  data: {
    sourceText: '',
    speech: '',
    showSettingDialog: false,
    apiKey: '',
    model: '',
    debugMode: false,
    debugInfo: {},
    isTranscribing: false,
    transcribedText: ''
  },

  onLoad() {
    const savedConfig = config.getConfig();
    this.setData({
      apiKey: savedConfig.apiKey,
      model: savedConfig.model
    });
  },

  onInputChange(e) {
    this.setData({
      sourceText: e.detail.value
    });
  },

  showSettings() {
    this.setData({
      showSettingDialog: true
    });
  },

  toggleDebugMode() {
    this.setData({
      debugMode: !this.data.debugMode
    });
  },

  updateDebugInfo(info) {
    this.setData({
      debugInfo: {
        ...this.data.debugInfo,
        ...info,
        timestamp: new Date().toLocaleString()
      }
    });
  },

  onSettingCancel() {
    this.setData({
      showSettingDialog: false
    });
  },

  onSettingSave(e) {
    const { apiKey, model } = e.detail.value;
    if (!apiKey.trim()) {
      wx.showToast({
        title: '请输入API Key',
        icon: 'none'
      });
      return;
    }

    config.saveConfig({ apiKey, model });
    this.setData({
      apiKey,
      model,
      showSettingDialog: false
    });
    wx.showToast({
      title: '设置已保存',
      icon: 'success'
    });
  },

  generateSpeech(e) {
    const targetLanguage = e.currentTarget.dataset.language;
    if (!this.data.sourceText.trim()) {
      wx.showToast({
        title: '请输入源文本',
        icon: 'none'
      });
      return;
    }

    this.updateDebugInfo({
      status: '开始生成',
      config: {
        apiKey: this.data.apiKey ? '已设置' : '未设置',
        model: this.data.model,
        textLength: this.data.sourceText.length
      }
    });

    wx.showLoading({
      title: '正在生成...'
    });

    wx.request({
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      method: 'POST',
      header: {
        'Authorization': `Bearer ${this.data.apiKey}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: this.data.model,
        messages: [{
          role: 'user',
          content: `请根据以下要求，生成一篇适合口译练习的3分钟${targetLanguage}演讲稿：\n\n1. 内容要求：\n- 将源文本改写为约450-500字的演讲稿\n- 保持原文核心观点，但使其更适合口头表达\n- 加入恰当的口语化表达和过渡词\n- 确保内容的连贯性和逻辑性\n\n2. 结构要求：\n- 开场引言(约60-70字)：包含吸引听众注意的开场白\n- 主体部分(约300-350字)：2-3个清晰的论述点\n- 结论部分(约80-90字)：总结核心观点并给出呼吁\n\n3. 语言风格：\n- 使用正式但不过于学术的语言\n- 避免过于复杂的句式\n- 适当增加修辞手法\n- 句子长度控制在15-25字之间\n- 加入适量的重复和强调\n\n源文本：${this.data.sourceText}`
        }],
        stream: false,
        max_tokens: 1024,
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        frequency_penalty: 0.5
      },
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.choices && res.data.choices[0]) {
          this.setData({
            speech: res.data.choices[0].message.content
          });
        } else {
          wx.showToast({
            title: '生成失败，请重试',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
      }
    });
  },

  transcribeAudio() {
    this.setData({ isTranscribing: true });
    this.updateDebugInfo({ status: '正在转换语音为文本' });

    // 模拟语音转文本过程
    setTimeout(() => {
      this.setData({
        isTranscribing: false,
        transcribedText: '这是语音转文本的示例结果。实际应用中，这里应该是调用语音识别API得到的结果。'
      });
      this.updateDebugInfo({ status: '语音转文本完成' });
    }, 2000);
  }
});