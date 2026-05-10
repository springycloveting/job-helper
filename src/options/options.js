// 求职助手 - 设置页面逻辑

document.addEventListener('DOMContentLoaded', () => {
  // Tab 切换
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // 加载已保存的设置
  loadSettings();
  loadResume();

  // 保存API配置
  document.getElementById('save-api-btn').addEventListener('click', saveApiSettings);

  // 测试API连接
  document.getElementById('test-api-btn').addEventListener('click', testApiConnection);

  // 保存简历
  document.getElementById('save-resume-btn').addEventListener('click', saveResumeInfo);
});

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (response.success) {
    const settings = response.data;
    document.getElementById('api-key').value = settings.apiKey || '';
    document.getElementById('base-url').value = settings.baseUrl || '';
    document.getElementById('model').value = settings.model || '';
  }
}

async function loadResume() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_RESUME' });
  if (response.success) {
    document.getElementById('resume-text').value = response.data || '';
  }
}

async function saveApiSettings() {
  const settings = {
    apiKey: document.getElementById('api-key').value.trim(),
    baseUrl: document.getElementById('base-url').value.trim(),
    model: document.getElementById('model').value.trim()
  };

  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    data: settings
  });

  if (response.success) {
    showStatus('api-status', '配置已保存', 'success');
  } else {
    showStatus('api-status', '保存失败: ' + response.error, 'error');
  }
}

async function testApiConnection() {
  const apiKey = document.getElementById('api-key').value.trim();
  const baseUrl = document.getElementById('base-url').value.trim();
  const model = document.getElementById('model').value.trim();

  if (!baseUrl) {
    showStatus('api-status', '请先输入API Base URL', 'error');
    return;
  }

  showStatus('api-status', '正在测试连接...', 'info');

  // 先保存当前配置
  await saveApiSettings();

  // 发送测试请求
  const response = await chrome.runtime.sendMessage({
    type: 'CALL_LLM',
    data: {
      messages: [
        { role: 'user', content: '请回复"连接成功"两个字' }
      ],
      temperature: 0
    }
  });

  if (response.success) {
    showStatus('api-status', `连接成功！模型回复: ${response.data}`, 'success');
  } else {
    showStatus('api-status', `连接失败: ${response.error}`, 'error');
  }
}

async function saveResumeInfo() {
  const resume = document.getElementById('resume-text').value.trim();

  if (!resume) {
    showStatus('resume-status', '请输入简历内容', 'error');
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_RESUME',
    data: resume
  });

  if (response.success) {
    showStatus('resume-status', '简历已保存', 'success');
  } else {
    showStatus('resume-status', '保存失败: ' + response.error, 'error');
  }
}

function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status-message ${type}`;

  // 5秒后自动隐藏成功/错误消息
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      el.className = 'status-message';
    }, 5000);
  }
}