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
    transcribedText: '',
    isRecording: false,
    recordedAudio: null,
    audioLevel: 0
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

  startRecording() {
    const recorderManager = wx.getRecorderManager();
    
    recorderManager.onStart(() => {
      this.setData({ isRecording: true });
      this.updateDebugInfo({ status: '开始录音' });
    });

    recorderManager.onError((error) => {
      console.error('录音失败:', error);
      let errorMessage = '录音失败';
      
      // 根据错误类型提供具体的错误信息
      switch(error.errMsg) {
        case 'operateRecorder:fail auth deny':
          errorMessage = '无法访问麦克风，请在设置中允许使用麦克风';
          break;
        case 'operateRecorder:fail system permission denied':
          errorMessage = '系统拒绝访问麦克风，请检查系统设置';
          break;
        case 'operateRecorder:fail:busy':
          errorMessage = '麦克风正在被其他应用使用，请先关闭';
          break;
        case 'operateRecorder:fail:latency':
          errorMessage = '录音设备响应超时，请重试';
          break;
        default:
          errorMessage = `录音失败: ${error.errMsg}`;
      }
      
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      });
      this.setData({ isRecording: false });
    });

    const options = {
      duration: 600000,
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 192000,
      format: 'wav'
    };

    // 先检查录音权限
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        recorderManager.start(options);
      },
      fail: () => {
        wx.showModal({
          title: '需要录音权限',
          content: '请允许使用麦克风进行录音',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
      }
    });
  },

  stopRecording() {
    const recorderManager = wx.getRecorderManager();
    
    recorderManager.onStop((res) => {
      this.setData({
        isRecording: false,
        recordedAudio: res.tempFilePath
      });
      this.updateDebugInfo({ status: '录音已完成' });
      
      // 自动开始转写录音内容
      this.transcribeAudio(res.tempFilePath);
    });

    recorderManager.stop();
  },

  transcribeAudio(audioPath) {
    if (!audioPath) {
      wx.showToast({
        title: '请先录制音频',
        icon: 'none'
      });
      return;
    }

    if (!this.data.apiKey) {
      wx.showToast({
        title: '请先设置API Key',
        icon: 'none'
      });
      return;
    }

    this.setData({ isTranscribing: true });
    this.updateDebugInfo({ status: '正在转换语音为文本' });

    wx.uploadFile({
      url: 'https://api.siliconflow.cn/v1/audio/transcriptions',
      filePath: audioPath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${this.data.apiKey}`
      },
      formData: {
        'model': 'FunAudioLLM/SenseVoiceSmall'
      },
      success: (res) => {
        try {
          const result = JSON.parse(res.data);
          if (result.text) {
            this.setData({
              transcribedText: result.text
            });
            this.updateDebugInfo({ status: '转写完成' });
          } else {
            throw new Error('转写结果为空');
          }
        } catch (error) {
          console.error('解析响应失败:', error);
          wx.showToast({
            title: '转写失败，请重试',
            icon: 'none'
          });
          this.updateDebugInfo({ status: '转写失败' });
        }
      },
      fail: (error) => {
        console.error('转写请求失败:', error);
        wx.showToast({
          title: '转写失败，请重试',
          icon: 'none'
        });
        this.updateDebugInfo({ status: '转写失败' });
      },
      complete: () => {
        this.setData({ isTranscribing: false });
      }
    });
  }
});