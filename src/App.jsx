import React, { useState, useRef, useEffect } from 'react';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import BuildIcon from '@mui/icons-material/Build';
import DownloadIcon from '@mui/icons-material/Download';
import RecordRTC, { StereoAudioRecorder } from 'recordrtc';

const defaultConfig = {
  model: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
  apiKey: '',
  voiceModel: 'fish-speech-1.5',
  voiceId: 'alex'
};

function App() {
  const [sourceText, setSourceText] = useState('');
  const [speech, setSpeech] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState(() => {
    const savedConfig = localStorage.getItem('apiConfig');
    return savedConfig ? JSON.parse(savedConfig) : defaultConfig;
  });
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState({});
  const [audioUrl, setAudioUrl] = useState('');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [prepTerms, setPrepTerms] = useState([]);
  const [isPreparingTerms, setIsPreparingTerms] = useState(false);
  const [isGeneratingChineseSpeech, setIsGeneratingChineseSpeech] = useState(false);
  const [isGeneratingEnglishSpeech, setIsGeneratingEnglishSpeech] = useState(false);
  
  // 录音相关状态
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [typingText, setTypingText] = useState('');
  const animationFrameRef = useRef(null);
  const [typingSpeed, setTypingSpeed] = useState(0);
  const [typingStartTime, setTypingStartTime] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [uploadedAudio, setUploadedAudio] = useState(null);
  const recorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const streamRef = useRef(null);

  const updateDebugInfo = (info) => {
    setDebugInfo(prev => ({
      ...prev,
      ...info,
      timestamp: new Date().toLocaleString()
    }));
  };

  const handleSettingsSave = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const newConfig = {
      apiKey: formData.get('apiKey'),
      model: formData.get('model'),
      voiceModel: formData.get('voiceModel'),
      voiceId: formData.get('voiceId')
    };

    if (!newConfig.apiKey.trim()) {
      alert('请输入API Key');
      return;
    }

    localStorage.setItem('apiConfig', JSON.stringify(newConfig));
    setConfig(newConfig);
    setShowSettings(false);
  };

  const prepareTranslation = async () => {
    if (!speech.trim()) {
      alert('请先生成演讲稿');
      return;
    }

    setIsPreparingTerms(true);
    updateDebugInfo({
      status: '正在分析术语',
      config: {
        ...debugInfo.config,
        action: '译前准备'
      }
    });

    try {
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{
            role: 'user',
            content: `请分析以下演讲稿中可能出现的翻译障碍，包括专业术语、新词与缩略语、跨领域术语、文化特色词汇、机构名称、品牌名、人名地名、特定语境下有特殊含义的词组、文中反复出现的关键术语、难点词组等。请严格按照以下JSON格式返回：
[
  {
    "term": "中文术语 | English Term",
    "explanation": "解释说明",
    "category": "分类"
  }
]

注意：
1. 必须返回有效的JSON数组
2. 每个术语必须包含上述三个字段
3. term字段必须同时包含中英文表达，用" | "分隔
4. 不要添加任何额外的文字说明

演讲稿内容：
${speech}`
          }],
          stream: false,
          max_tokens: 1024,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('API请求失败');
      }

      const data = await response.json();
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('API返回数据格式错误');
      }

      try {
        const terms = JSON.parse(data.choices[0].message.content);
        if (!Array.isArray(terms)) {
          throw new Error('返回数据不是有效的数组格式');
        }
        
        const isValidTerm = (term) => (
          term &&
          typeof term.term === 'string' &&
          typeof term.explanation === 'string' &&
          typeof term.category === 'string'
        );

        if (!terms.every(isValidTerm)) {
          throw new Error('返回数据字段格式不正确');
        }

        setPrepTerms(terms);
        updateDebugInfo({ status: '术语分析完成' });
      } catch (parseError) {
        console.error('解析返回数据失败:', parseError);
        updateDebugInfo({ status: '数据解析失败' });
        alert(`数据解析失败：${parseError.message}`);
      }
    } catch (error) {
      console.error('Error:', error);
      updateDebugInfo({ status: error.message || '术语分析失败' });
      alert(error.message || '术语分析失败，请重试');
    } finally {
      setIsPreparingTerms(false);
    }
  };

  // 更新音频电平
  const updateAudioLevel = () => {
    if (!analyserRef.current || !isRecording) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // 计算音频电平
    const average = dataArray.reduce((acc, value) => acc + value, 0) / dataArray.length;
    const normalizedLevel = Math.min(average / 128, 1);
    setAudioLevel(normalizedLevel);

    // 继续下一帧更新
    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
  };

  // 初始化音频上下文
  const initAudioContext = async () => {
    try {
      // 先请求麦克风权限并获取流
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 保存获取到的音频流
      streamRef.current = stream;
      
      // 权限获取成功后初始化音频上下文
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      // 创建源节点
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceNodeRef.current.connect(analyserRef.current);
      return stream;
    } catch (error) {
      console.error('音频上下文初始化失败:', error);
      return null;
    }
  };

  // 开始录音
  const startRecording = async () => {
    try {
      // 确保音频上下文已初始化并获取流
      const stream = !audioContextRef.current ? await initAudioContext() : streamRef.current;
      if (!stream) {
        throw new Error('无法初始化音频设备');
      }

      // 确保RecordRTC已正确导入
      if (typeof RecordRTC === 'undefined') {
        throw new Error('录音组件未正确加载');
      }
      
      // 创建 RecordRTC 实例
      recorderRef.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        sampleRate: 48000,
        numberOfAudioChannels: 2,
        audioBitsPerSecond: 128000,
        recorderType: RecordRTC.StereoAudioRecorder
      });

      // 开始录音和音频可视化
      recorderRef.current.startRecording();
      updateAudioLevel();
      setIsRecording(true);
      updateDebugInfo({ status: '正在录音' });
    } catch (error) {
      console.error('录音失败:', {
        errorType: error.name,
        errorMessage: error.message,
        errorStack: error.stack
      });
      let errorMessage = '录音失败，请重试';
      
      switch (error.name) {
        case 'NotAllowedError':
          errorMessage = '无法访问麦克风，请检查：\n1. 是否已在浏览器中允许麦克风访问\n2. 系统设置中是否已授权浏览器使用麦克风';
          break;
        case 'NotFoundError':
          errorMessage = '未检测到麦克风设备，请检查：\n1. 麦克风设备是否正确连接\n2. 系统是否识别到麦克风设备\n3. 在系统声音设置中测试麦克风';
          break;
        case 'NotReadableError':
          errorMessage = '麦克风设备被占用或异常，请检查：\n1. 是否有其他应用正在使用麦克风（如视频会议软件）\n2. 尝试关闭占用麦克风的应用后重试\n3. 检查麦克风驱动是否正常';
          break;
        case 'NotSupportedError':
          errorMessage = '浏览器不支持所需的录音功能，请检查：\n1. 是否使用的是最新版本的现代浏览器\n2. 尝试使用其他主流浏览器（如 Chrome）';
          break;
        case 'OverconstrainedError':
          errorMessage = '录音设置不满足要求，请检查：\n1. 麦克风设备是否支持当前的录音配置\n2. 尝试使用默认的录音设置';
          break;
        case 'SecurityError':
          errorMessage = '录音请求被拒绝，请检查：\n1. 是否在安全的网络环境下使用（HTTPS或localhost）\n2. 浏览器的安全策略设置';
          break;
        default:
          errorMessage = `录音失败（${error.name}），请检查：\n1. 浏览器兼容性\n2. 麦克风权限\n3. 设备状态`;
          break;
      }
      
      alert(errorMessage);
      updateDebugInfo({ 
        status: '录音失败', 
        error: {
          type: error.name,
          message: error.message
        }
      });
    }
  };

  const stopRecording = async () => {
    if (recorderRef.current && isRecording) {
      try {
        // 停止录音
        recorderRef.current.stopRecording(() => {
          // 获取录音数据
          const audioBlob = recorderRef.current.getBlob();
          const audioUrl = URL.createObjectURL(audioBlob);
      
          // 更新UI状态
          setIsRecording(false);
          if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
          }
          if (recorderRef.current.stream) {
            recorderRef.current.stream.getTracks().forEach(track => track.stop());
          }
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          setAudioLevel(0);
          setRecordedAudio(audioUrl);
          
          updateDebugInfo({ status: '录音已完成' });
          
          // 直接使用生成的audioBlob进行转写
          transcribeAudio(audioBlob);
        });
      } catch (error) {
        console.error('录音停止失败:', error);
        alert('录音处理失败，请重试');
        updateDebugInfo({ status: '录音处理失败' });
      }
    }
  };

  const generateAudio = async () => {
    if (!speech.trim()) {
      alert('请先生成演讲稿');
      return;
    }

    setIsGeneratingAudio(true);
    updateDebugInfo({
      status: '正在生成语音',
      config: {
        ...debugInfo.config,
        voiceModel: config.voiceModel,
        voiceId: config.voiceId
      }
    });

    try {
      const response = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: `fishaudio/${config.voiceModel}`,
          voice: `fishaudio/${config.voiceModel}:${config.voiceId}`,
          input: speech,
          response_format: 'mp3'
        })
      });

      if (!response.ok) {
        throw new Error('语音生成失败');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      updateDebugInfo({ status: '语音生成完成' });
    } catch (error) {
      alert('语音生成失败，请重试');
      console.error('Error:', error);
      updateDebugInfo({ status: '语音生成失败' });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleDownload = (format, type = 'text') => {
    // 导出音频文件
    if (type === 'source-audio' && audioUrl) {
      fetch(audioUrl)
        .then(response => response.blob())
        .then(blob => {
          const now = new Date();
          const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `演讲口译_原文音频_${dateStr}.mp3`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        })
        .catch(error => {
          console.error('导出音频失败:', error);
          alert('导出音频失败，请重试');
        });
      return;
    }

    // 导出译文音频
    if (type === 'target-audio' && recordedAudio) {
      fetch(recordedAudio)
        .then(response => response.blob())
        .then(blob => {
          const now = new Date();
          const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `演讲口译_译文音频_${dateStr}.wav`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        })
        .catch(error => {
          console.error('导出音频失败:', error);
          alert('导出音频失败，请重试');
        });
      return;
    }

    if (!speech && !typingText && !evaluationResult) {
      alert('没有可导出的内容');
      return;
    }

    let content = '';
    const timestamp = new Date().toLocaleString();

    if (format === 'txt') {
      content = `演讲口译练习记录 - ${timestamp}\n\n`;
      if (speech) content += `【生成的演讲稿】\n${speech}\n\n`;
      if (typingText) content += `【口译内容】\n${typingText}\n\n`;
      if (evaluationResult) content += `【评估结果】\n${evaluationResult}\n\n【译后反思】\n1.\n- Original:\n- What I Said:\n- I Should Have Said:\n- Diagnosis / Cure:\n\n- 3 challenges I encountered:\n- 3 things I did well:\n- 3 things to improve:\n`;
    } else if (format === 'md') {
      content = `# 演讲口译练习记录\n\n*记录时间：${timestamp}*\n\n`;
      if (speech) content += `## 生成的演讲稿\n\n${speech}\n\n`;
      if (typingText) content += `## 口译内容\n\n${typingText}\n\n`;
      if (evaluationResult) content += `## 评估结果\n\n${evaluationResult}\n\n## 译后反思\n\n1.\n- Original:\n- What I Said:\n- I Should Have Said:\n- Diagnosis / Cure:\n\n- 3 challenges I encountered:\n- 3 things I did well:\n- 3 things to improve:\n`;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `演讲口译_评估反思_${dateStr}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const transcribeAudio = async (audioBlob) => {
    setIsTranscribing(true);
    updateDebugInfo({ status: '正在转写录音' });
    
    try {
      const form = new FormData();
      form.append('file', audioBlob, 'recording.wav');
      form.append('model', 'FunAudioLLM/SenseVoiceSmall');

      const response = await fetch('https://api.siliconflow.cn/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`
        },
        body: form,
      });
      
      if (!response.ok) {
        throw new Error('转写请求失败');
      }
      
      const result = await response.json();
      if (result.text) {
        setTypingText(result.text);
        updateDebugInfo({ status: '转写完成' });
      } else {
        throw new Error('转写结果为空');
      }
    } catch (error) {
      console.error('转写失败:', error);
      alert('转写失败，请重试');
      updateDebugInfo({ status: '转写失败' });
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleAudioUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadedAudio(url);
      updateDebugInfo({ status: '音频文件已上传' });
      // 自动转写上传的音频
      transcribeAudio(file);
    }
  };

  const calculateScore = (evaluation, section) => {
    // 匹配 "准确性评估：85分" 这种格式
    const regex = new RegExp(`${section}[^]*?(\d+)分`, 'i');
    const match = evaluation.match(regex);
    return match ? parseInt(match[1]) : null;
  };

  const savePracticeRecord = () => {
    if (!speech && !typingText && !evaluationResult) {
      alert('没有可保存的练习记录');
      return;
    }

    // 提取各项分数
    const accuracyScore = calculateScore(evaluationResult, '准确性评估') || 0;
    const expressionScore = calculateScore(evaluationResult, '语言表达') || 0;
    const skillsScore = calculateScore(evaluationResult, '口译技巧') || 0;

    // 计算加权总分
    const totalScore = 
      (accuracyScore * 0.40) + 
      (expressionScore * 0.30) + 
      (skillsScore * 0.30);

    const practiceRecord = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      speech,
      typingText,
      evaluationResult,
      audioUrl: recordedAudio || uploadedAudio,
      stats: {
        accuracy: accuracyScore,
        expression: expressionScore,
        skills: skillsScore,
        totalScore: Math.round(totalScore * 10) / 10 // 保留一位小数
      }
    };

    const newHistory = [practiceRecord, ...practiceHistory];
    setPracticeHistory(newHistory);
    localStorage.setItem('practiceHistory', JSON.stringify(newHistory));
    updateDebugInfo({ status: '练习记录已保存' });
  };

  const handleEvaluateTranslation = async () => {
    if (!speech.trim() || !typingText.trim()) {
      alert('请确保已生成演讲稿且已输入口译内容');
      return;
    }

    setIsEvaluating(true);
    updateDebugInfo({
      status: '正在评估口译',
      config: {
        ...debugInfo.config,
        action: '口译评估'
      }
    });

    try {
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{
            role: 'user',
            content: `请对比原文和口译内容，根据以下评估框架进行全面评估（不要生成 markdown 格式）：

原文：
${speech}

口译：
${typingText}

评估框架：
1. 评估维度（请逐项打分0-100分并详细说明，请务必在每个维度的打分环节写成 “准确性评估：X分（0-100）” 的形式，例如：“准确性评估：85分”。）：
A. 准确性（40%权重）
- 信息完整度
- 重要信息保留
- 数字/专有名词准确性
- 逻辑关系还原
- 标注所有遗漏/添加/曲解的内容

B. 语言表达（30%权重）
- 语言规范性
- 表达流畅度
- 语域适当性
- 连贯性
- 标注所有不自然/生硬的表达

C. 口译技巧（30%权重）
- 重组能力
- 应变能力
- 语速控制
- 停顿处理
- 语调语气

加权总分：准确性*40% + 语言表达*30% + 口译技巧*30%

【返回示例】
A. 准确性：85分
- 信息完整度
- ...
B. 语言表达：76分
- ...
C. 口译技巧：80分
- ...
加权总分：80.8分

2. 问题分类与具体示例：
请列出所有问题，并按以下类别分类：
- 严重错误（影响理解）
- 表达不当（影响流畅）
- 技巧欠缺（影响效果）

3. 修改建议：
A. 正式场合版本修改建议
- 提供更规范/专业的表达方式
- 建议使用的固定搭配
- 句式调整建议
- 术语规范化建议

B. 口语场合版本修改建议
- 提供更自然的口语表达
- 建议使用的口语化表达
- 语气调整建议
- 互动性增强建议

4. 根据原文：${speech}生成参考译文：
A. 正式场合版本
B. 口语场合版本

请确保评估全面、客观，并提供具体的改进建议。`
          }],
          stream: false,
          max_tokens: 3072,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('评估请求失败');
      }

      const data = await response.json();
      if (data.choices && data.choices[0]) {
        setEvaluationResult(data.choices[0].message.content);
        updateDebugInfo({ status: '评估完成' });
      } else {
        throw new Error('评估生成失败');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('评估失败，请重试');
      updateDebugInfo({ status: '评估失败' });
    } finally {
      setIsEvaluating(false);
      // 自动保存练习记录
      savePracticeRecord();
    }
  };

  const generateSpeech = async (targetLanguage) => {
    if (!sourceText.trim()) {
      alert('请输入源文本');
      return;
    }

    if (targetLanguage === '中文') {
      setIsGeneratingChineseSpeech(true);
    } else {
      setIsGeneratingEnglishSpeech(true);
    }

    updateDebugInfo({
      status: '开始生成',
      config: {
        apiKey: config.apiKey ? '已设置' : '未设置',
        model: config.model,
        textLength: sourceText.length
      }
    });

    try {
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{
            role: 'user',
            content: `请根据以下要求，生成一篇适合口译练习的2分钟${targetLanguage}演讲稿：\n\n1. 内容要求：\n- 将源文本改写为约220-320字（中文）或 200-280词（英文）的演讲稿 \n- 不要带括号括注语气词、停顿、时间、开头结尾等提示（例如，（开场引言62字）（第一论述点）（第二论述点））（第三论述点）等，通通不要出现！\n- 保持原文核心观点，但使其更适合口头表达\n- 加入恰当的口语化表达和过渡词\n- 确保内容的连贯性和逻辑性\n\n2. 结构要求：\n- 开场引言(约60-70字)：包含吸引听众注意的开场白\n- 主体部分(约300-350字)：2-3个清晰的论述点\n- 结论部分(约80-90字)：总结核心观点并给出呼吁\n\n3. 语言风格：\n- 使用正式但不过于学术的语言\n- 避免过于复杂的句式\n- 适当增加修辞手法\n- 句子长度控制在15-25字之间\n- 加入适量的重复和强调\n\n源文本：${sourceText}`
          }],
          stream: false,
          max_tokens: 1024,
          temperature: 0.7,
          top_p: 0.7,
          top_k: 50,
          frequency_penalty: 0.5
        })
      });

      const data = await response.json();
      if (data.choices && data.choices[0]) {
        setSpeech(data.choices[0].message.content);
      } else {
        throw new Error('生成失败');
      }
    } catch (error) {
      alert('生成失败，请重试');
      console.error('Error:', error);
    } finally {
      if (targetLanguage === '中文') {
        setIsGeneratingChineseSpeech(false);
      } else {
        setIsGeneratingEnglishSpeech(false);
      }
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4, position: 'relative', minHeight: '100vh' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1">我要练口译</Typography>
        <Box>
          <IconButton onClick={() => setDebugMode(!debugMode)} sx={{ mr: 1 }}>
            <BuildIcon />
          </IconButton>
          <IconButton onClick={() => setShowSettings(true)}>
            <SettingsIcon />
          </IconButton>
        </Box>
      </Box>

      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>请输入源文本：</Typography>
        <TextField
          fullWidth
          multiline
          rows={6}
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="在此输入需要转换的文本内容..."
        />
      </Paper>

      <Box sx={{ textAlign: 'center', mb: 4, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Button
          variant="contained"
          size="large"
          onClick={() => generateSpeech('中文')}
          disabled={isGeneratingChineseSpeech}
        >
          {isGeneratingChineseSpeech ? '生成中...' : '生成中文演讲稿'}
        </Button>
        <Button
          variant="contained"
          size="large"
          onClick={() => generateSpeech('英文')}
          disabled={isGeneratingEnglishSpeech}
        >
          {isGeneratingEnglishSpeech ? '生成中...' : '生成英文演讲稿'}
        </Button>
      </Box>

      {speech && (
        <Paper elevation={3} sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>生成的演讲稿：</Typography>
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
            {speech}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="contained"
              onClick={generateAudio}
              disabled={isGeneratingAudio}
            >
              {isGeneratingAudio ? '生成语音中...' : '生成语音'}
            </Button>
            <Button
              variant="contained"
              onClick={prepareTranslation}
              disabled={isPreparingTerms || !speech.trim()}
              sx={{ mr: 1 }}
            >
              {isPreparingTerms ? '分析中...' : '译前准备'}
            </Button>
          </Box>
          {audioUrl && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>AI 生成语音：</Typography>
              <audio controls src={audioUrl} style={{ width: '100%' }} />
            </Box>
          )}
          
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>录音练习</Typography>
            <Box sx={{ mb: 2 }}>
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                style={{ display: 'none' }}
                id="audio-upload"
              />
              <label htmlFor="audio-upload">
                <Button
                  variant="outlined"
                  component="span"
                  sx={{ mr: 1 }}
                >
                  上传录音
                </Button>
              </label>
              {uploadedAudio && (
                <audio controls src={uploadedAudio} style={{ marginLeft: '10px' }} />
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              {!isRecording ? (
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={startRecording}
                >
                  开始录音
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color="error"
                  onClick={stopRecording}
                >
                  停止录音
                </Button>
              )}
              {isRecording && (
                <Box sx={{ flex: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={audioLevel * 100}
                    sx={{
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: 'rgba(255, 0, 0, 0.1)',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: 'red',
                      }
                    }}
                  />
                </Box>
              )}
            </Box>
            {recordedAudio && !isRecording && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>录音回放：</Typography>
                <audio controls src={recordedAudio} style={{ width: '100%' }} />
              </Box>
            )}
          </Box>

          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>口述练习</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>原文：</Typography>
                <Paper elevation={1} sx={{ p: 2, bgcolor: '#f5f5f5', mb: 2 }}>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {speech}
                  </Typography>
                </Paper>
              </Box>
              <Box>
                <Typography variant="h6" sx={{ mb: 2 }}>口译内容：</Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={6}
                  value={typingText}
                  onChange={(e) => {
                    setTypingText(e.target.value);
                  }}
                  placeholder="请输入您的口译内容..."
                  sx={{ mb: 2 }}
                />
                <Button
                  variant="contained"
                  onClick={handleEvaluateTranslation}
                  disabled={isEvaluating || !speech || !typingText}
                  fullWidth
                >
                  {isEvaluating ? '正在评估...' : '提交获取点评'}
                </Button>
              </Box>
              {evaluationResult && (
                <Box>
                  <Typography variant="h6" sx={{ mb: 2 }}>评估结果：</Typography>
                  <Paper elevation={1} sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {evaluationResult}
                    </Typography>
                  </Paper>
                </Box>
              )}
            </Box>
          </Box>

          {prepTerms.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>译前准备材料：</Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>中文词块</TableCell>
                      <TableCell>English Terms</TableCell>
                      <TableCell>解释说明</TableCell>
                      <TableCell>分类</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {prepTerms.map((term, index) => (
                      <TableRow key={index}>
                        <TableCell>{term.term.split(' | ')[0]}</TableCell>
                        <TableCell>{term.term.split(' | ')[1] || '-'}</TableCell>
                        <TableCell>{term.explanation}</TableCell>
                        <TableCell>{term.category}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Paper>
      )}

      {debugMode && (
        <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>调试信息</Typography>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Typography>状态：{debugInfo.status || '空闲'}</Typography>
            <Typography>API Key：{debugInfo.config?.apiKey}</Typography>
            <Typography>模型：{debugInfo.config?.model}</Typography>
            <Typography>文本长度：{debugInfo.config?.textLength || 0}</Typography>
            <Typography>更新时间：{debugInfo.timestamp || '-'}</Typography>
          </Box>
        </Paper>
      )}

      <Dialog open={showSettings} onClose={() => setShowSettings(false)}>
        <form onSubmit={handleSettingsSave}>
          <DialogTitle>设置</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              margin="normal"
              label="API Key"
              name="apiKey"
              defaultValue={config.apiKey}
            />
            <TextField
              fullWidth
              margin="normal"
              label="模型"
              name="model"
              defaultValue={config.model}
            />
            <TextField
              fullWidth
              margin="normal"
              label="语音模型"
              name="voiceModel"
              defaultValue={config.voiceModel}
            />
            <TextField
              fullWidth
              margin="normal"
              label="音色"
              name="voiceId"
              defaultValue={config.voiceId}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowSettings(false)}>取消</Button>
            <Button type="submit" variant="contained">保存</Button>
          </DialogActions>
        </form>
      </Dialog>

      {(speech || typingText || evaluationResult) && (
        <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>下载保存</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              onClick={() => handleDownload('txt')}
              startIcon={<DownloadIcon />}
            >
              导出TXT
            </Button>
            <Button
              variant="outlined"
              onClick={() => handleDownload('md')}
              startIcon={<DownloadIcon />}
            >
              导出Markdown
            </Button>
            <Button
              variant="outlined"
              onClick={() => handleDownload('source-audio', 'source-audio')}
              startIcon={<DownloadIcon />}
              disabled={!audioUrl}
            >
              导出原文音频
            </Button>
            <Button
              variant="outlined"
              onClick={() => handleDownload('target-audio', 'target-audio')}
              startIcon={<DownloadIcon />}
              disabled={!recordedAudio}
            >
              导出译文音频
            </Button>
          </Box>
        </Paper>
      )}
      <Typography 
        variant="body2" 
        color="text.secondary" 
        align="center" 
        sx={{ 
          position: 'absolute',
          bottom: 16,
          left: 0,
          right: 0
        }}
      >
        小红书：熊小译 | 公众号：崧说Xshare
      </Typography>
    </Container>
  );
}

export default App;