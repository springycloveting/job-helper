// 求职助手 - Background Service Worker
// 负责处理大模型API调用和消息中转

// 监听来自Content Script和Popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CALL_LLM') {
    callLLM(request.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开放，等待异步响应
  }

  if (request.type === 'GET_SETTINGS') {
    getSettings()
      .then(settings => sendResponse({ success: true, data: settings }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'SAVE_SETTINGS') {
    saveSettings(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'GET_RESUME') {
    getResume()
      .then(resume => sendResponse({ success: true, data: resume }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'SAVE_RESUME') {
    saveResume(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 获取设置
async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || { apiKey: '', baseUrl: '', model: '' };
}

// 保存设置
async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

// 获取简历
async function getResume() {
  const result = await chrome.storage.local.get('resume');
  return result.resume || '';
}

// 保存简历
async function saveResume(resume) {
  await chrome.storage.local.set({ resume });
}

// 调用大模型API（OpenAI兼容格式）
async function callLLM({ messages, temperature = 0.3 }) {
  const settings = await getSettings();

  if (!settings.baseUrl) {
    throw new Error('请先在设置中配置API Base URL');
  }

  const model = settings.model || 'gpt-3.5-turbo';

  const url = `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers = {
    'Content-Type': 'application/json'
  };
  // 本地模型可能不需要API Key，有则添加
  if (settings.apiKey) {
    headers['Authorization'] = `Bearer ${settings.apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API请求失败: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}