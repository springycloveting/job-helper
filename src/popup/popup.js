// 求职助手 - Popup 逻辑

document.addEventListener('DOMContentLoaded', () => {
  checkStatus();
  setupActions();
});

async function checkStatus() {
  // 检查API配置状态
  const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const apiStatusEl = document.getElementById('api-status');
  if (settingsResponse.success && settingsResponse.data.baseUrl) {
    apiStatusEl.classList.add('ready');
    apiStatusEl.querySelector('.status-text').textContent = 'API 已配置';
  } else {
    apiStatusEl.classList.add('warning');
    apiStatusEl.querySelector('.status-text').textContent = 'API 未配置';
  }

  // 检查简历状态
  const resumeResponse = await chrome.runtime.sendMessage({ type: 'GET_RESUME' });
  const resumeStatusEl = document.getElementById('resume-status');
  if (resumeResponse.success && resumeResponse.data) {
    resumeStatusEl.classList.add('ready');
    resumeStatusEl.querySelector('.status-text').textContent = '简历已填写';
  } else {
    resumeStatusEl.classList.add('warning');
    resumeStatusEl.querySelector('.status-text').textContent = '简历未填写';
  }

  // 检查当前页面是否在招聘平台
  const platformStatusEl = document.getElementById('platform-status');
  const pageInfoEl = document.getElementById('page-info');
  const analyzeBtn = document.getElementById('analyze-current-btn');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      let platform = null;

      if (url.hostname.includes('zhipin.com')) {
        platform = 'Boss直聘';
      } else if (url.hostname.includes('lagou.com')) {
        platform = '拉勾网';
      }

      if (platform) {
        platformStatusEl.classList.add('ready');
        platformStatusEl.querySelector('.status-text').textContent = `${platform} 已连接`;

        pageInfoEl.style.display = 'block';
        document.getElementById('platform-name').textContent = platform;

        // 如果已配置Base URL，启用分析按钮
        if (settingsResponse.success && settingsResponse.data.baseUrl) {
          analyzeBtn.disabled = false;
        }
      } else {
        platformStatusEl.classList.add('error');
        platformStatusEl.querySelector('.status-text').textContent = '未检测到招聘平台';
      }
    }
  } catch (e) {
    platformStatusEl.classList.add('error');
    platformStatusEl.querySelector('.status-text').textContent = '无法检测当前页面';
  }
}

function setupActions() {
  // 打开设置页
  document.getElementById('go-settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 分析当前页面（触发Content Script的分析功能）
  document.getElementById('analyze-current-btn').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_ANALYZE' });
        window.close(); // 关闭popup
      }
    } catch (e) {
      // 忽略错误
    }
  });
}