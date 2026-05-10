// 求职助手 - Content Script
// 在招聘平台页面上叠加显示过滤结果和匹配评分

// ==================== 岗位信息提取器 ====================

function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes('zhipin.com')) return 'boss';
  if (host.includes('lagou.com')) return 'lagou';
  return 'unknown';
}

function extractBossJobInfo(jobCard) {
  const info = {};
  // 基于真实DOM结构：.job-card-box > .job-info > .job-title > .job-name + .job-salary
  const nameEl = jobCard.querySelector('.job-name');
  info.title = nameEl ? nameEl.textContent.trim() : '';
  const salaryEl = jobCard.querySelector('.job-salary');
  info.salary = salaryEl ? salaryEl.textContent.trim() : '';
  const companyEl = jobCard.querySelector('.boss-name');
  info.company = companyEl ? companyEl.textContent.trim() : '';
  const locationEl = jobCard.querySelector('.company-location');
  info.location = locationEl ? locationEl.textContent.trim() : '';
  const tagsEl = jobCard.querySelector('.tag-list');
  info.tags = tagsEl ? tagsEl.textContent.trim() : '';
  // 拼接精简摘要，避免fullText过长超出模型上下文
  info.summary = [info.title, info.salary, info.tags, info.company, info.location].filter(Boolean).join(' | ');
  return info;
}

function extractLagouJobInfo(jobCard) {
  const info = {};
  // 基于真实DOM结构：.item__10RTO > .item-top__1Z3Zo > .position__21iOS > .p-top__1F7CL > a
  const nameEl = jobCard.querySelector('.p-top__1F7CL a, [class*="p-top"] a');
  info.title = nameEl ? nameEl.textContent.trim().split('[')[0] : ''; // 去掉地点信息
  
  const salaryEl = jobCard.querySelector('.money__3Lkgq, [class*="money"]');
  info.salary = salaryEl ? salaryEl.textContent.trim() : '';
  
  const companyEl = jobCard.querySelector('.company-name__2-SjF a, [class*="company-name"] a');
  info.company = companyEl ? companyEl.textContent.trim() : '';
  
  const locationEl = jobCard.querySelector('.p-top__1F7CL a');
  if (locationEl) {
    const match = locationEl.textContent.match(/\[(.+?)\]/);
    info.location = match ? match[1] : '';
  }
  
  const tagsEl = jobCard.querySelector('.p-bom__JlNur, [class*="p-bom"]');
  info.tags = tagsEl ? tagsEl.textContent.trim() : '';
  
  const industryEl = jobCard.querySelector('.industry__1HBkr, [class*="industry"]');
  info.industry = industryEl ? industryEl.textContent.trim() : '';
  
  // 拼接精简摘要
  info.summary = [info.title, info.salary, info.tags, info.company, info.industry, info.location].filter(Boolean).join(' | ');
  return info;
}

function extractJobInfo(jobCard) {
  const platform = detectPlatform();
  switch (platform) {
    case 'boss': return extractBossJobInfo(jobCard);
    case 'lagou': return extractLagouJobInfo(jobCard);
    default: return { fullText: jobCard.textContent.trim() };
  }
}

function extractJobDetailFromPage() {
  // 详情页：提取关键信息而非整页文本，避免超出模型上下文
  const info = { url: window.location.href, platform: detectPlatform() };
  
  if (detectPlatform() === 'boss') {
    const nameEl = document.querySelector('.name h1, .job-name, h1');
    info.title = nameEl ? nameEl.textContent.trim() : '';
    const salaryEl = document.querySelector('.salary, .job-salary, .salary-info');
    info.salary = salaryEl ? salaryEl.textContent.trim() : '';
    const tagsEl = document.querySelector('.job-sec-text, .tag-list, .detail-op');
    info.tags = tagsEl ? tagsEl.textContent.trim().substring(0, 200) : '';
    const companyEl = document.querySelector('.company-info .name, .boss-name');
    info.company = companyEl ? companyEl.textContent.trim() : '';
    // 岗位描述（JD）截断到500字
    const descEl = document.querySelector('.job-sec-text, .job-detail-section, [class*="job-desc"]');
    info.description = descEl ? descEl.textContent.trim().substring(0, 500) : '';
  }
  
  info.summary = [info.title, info.salary, info.tags, info.company, info.description].filter(Boolean).join(' | ');
  return info;
}

// ==================== UI 注入 ====================

function injectAnalysisUI(jobCard) {
  if (jobCard.querySelector('.jh-analysis-container')) return;

  const container = document.createElement('div');
  container.className = 'jh-analysis-container';
  container.innerHTML = `
    <button class="jh-analyze-btn" title="分析此岗位">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      分析
    </button>
    <div class="jh-result-panel" style="display:none;"></div>
  `;

  const btn = container.querySelector('.jh-analyze-btn');
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    analyzeJob(jobCard, container);
  });

  jobCard.style.position = 'relative';
  jobCard.appendChild(container);
}

function showAnalysisResult(container, result) {
  const panel = container.querySelector('.jh-result-panel');
  panel.style.display = 'block';

  let riskClass = 'jh-risk-low';
  let riskLabel = '低风险';
  if (result.riskLevel === 'high') { riskClass = 'jh-risk-high'; riskLabel = '高风险'; }
  else if (result.riskLevel === 'medium') { riskClass = 'jh-risk-medium'; riskLabel = '中风险'; }

  let matchClass = 'jh-match-low';
  let matchLabel = '未评估';
  if (result.matchScore !== null) {
    if (result.matchScore >= 70) { matchClass = 'jh-match-high'; matchLabel = '较匹配'; }
    else if (result.matchScore >= 40) { matchClass = 'jh-match-medium'; matchLabel = '一般'; }
    else { matchClass = 'jh-match-low'; matchLabel = '不匹配'; }
  }

  // 精简摘要面板
  panel.innerHTML = `
    <div class="jh-summary">
      <span class="jh-risk-badge ${riskClass}">${riskLabel}</span>
      ${result.matchScore !== null ? `<span class="jh-match-badge ${matchClass}">${result.matchScore}分·${matchLabel}</span>` : ''}
      <button class="jh-detail-btn">详情</button>
      <button class="jh-reanalyze-btn" title="重新分析">↻</button>
      <button class="jh-close-btn" title="收起">✕</button>
    </div>
  `;

  // 隐藏分析按钮，显示摘要
  const analyzeBtn = container.querySelector('.jh-analyze-btn');
  analyzeBtn.style.display = 'none';

  // 关闭摘要 → 恢复分析按钮
  panel.querySelector('.jh-close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    panel.style.display = 'none';
    analyzeBtn.style.display = '';
  });

  // 重新分析
  panel.querySelector('.jh-reanalyze-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const jobCard = container.parentElement;
    analyzeJob(jobCard, container);
  });

  // 查看详情
  panel.querySelector('.jh-detail-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const jobCard = container.parentElement;
    const jobInfo = extractJobInfo(jobCard);
    showDetailModal(result, riskClass, riskLabel, matchClass, jobInfo);
  });
}

// 弹出大面板显示完整分析结果
function showDetailModal(result, riskClass, riskLabel, matchClass, jobInfo) {
  // 移除旧弹窗
  const old = document.querySelector('.jh-detail-modal');
  if (old) old.remove();

  let matchLabel = '未评估';
  if (result.matchScore !== null) {
    if (result.matchScore >= 70) matchLabel = '较匹配';
    else if (result.matchScore >= 40) matchLabel = '一般';
    else matchLabel = '不匹配';
  }

  // 只有匹配度>=30且有建议时才显示生成简历按钮
  const showResumeBtn = result.matchScore !== null && result.matchScore >= 30 && result.suggestions;

  const modal = document.createElement('div');
  modal.className = 'jh-detail-modal';
  modal.innerHTML = `
    <div class="jh-modal-overlay"></div>
    <div class="jh-modal-card">
      <div class="jh-modal-header">
        <span class="jh-modal-title">求职助手 · 详细分析</span>
        <button class="jh-modal-close">&times;</button>
      </div>
      <div class="jh-modal-body">
        <div class="jh-modal-section jh-risk-section">
          <div class="jh-section-label">风险评估</div>
          <div class="jh-modal-row">
            <span class="jh-risk-badge ${riskClass}">${riskLabel}</span>
            <span class="jh-risk-reasons">${result.riskReasons || '未发现明显风险'}</span>
          </div>
        </div>
        ${result.matchScore !== null ? `
        <div class="jh-modal-section jh-match-section">
          <div class="jh-section-label">匹配度评分</div>
          <div class="jh-modal-row">
            <div class="jh-match-big ${matchClass}">${result.matchScore}<small>分</small></div>
            <span class="jh-match-label ${matchClass}">${matchLabel}</span>
          </div>
          ${result.matchDetails ? `
          <div class="jh-modal-subsection">
            <div class="jh-subsection-title">匹配分析</div>
            <div class="jh-match-details">${result.matchDetails}</div>
          </div>` : ''}
        </div>` : ''}
        ${result.suggestions ? `
        <div class="jh-modal-section jh-suggestion-section">
          <div class="jh-section-label">简历优化建议</div>
          <div class="jh-suggestions">${result.suggestions}</div>
        </div>` : ''}
        ${showResumeBtn ? `
        <div class="jh-modal-section jh-resume-gen-section">
          <button class="jh-gen-resume-btn">生成针对性简历</button>
        </div>` : ''}
        <div class="jh-resume-result" style="display:none;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 生成针对性简历
  if (showResumeBtn) {
    const genBtn = modal.querySelector('.jh-gen-resume-btn');
    const resumeResultArea = modal.querySelector('.jh-resume-result');
    genBtn.addEventListener('click', async () => {
      genBtn.disabled = true;
      genBtn.textContent = '生成中...';
      try {
        const tailoredResume = await generateTailoredResume(jobInfo || {}, result.suggestions);
        // Markdown → HTML 排版渲染
        const resumeHTML = parseMarkdownToHTML(tailoredResume);
        resumeResultArea.style.display = 'block';
        resumeResultArea.innerHTML = `
          <div class="jh-tailored-resume">
            <div class="jh-resume-header">
              <span class="jh-resume-title">针对性简历</span>
              <div class="jh-resume-actions">
                <button class="jh-export-word-btn">导出Word</button>
                <button class="jh-export-pdf-btn">导出PDF</button>
                <button class="jh-copy-resume-btn">复制</button>
              </div>
            </div>
            <div class="jh-resume-content">${resumeHTML}</div>
          </div>
        `;
        // 导出Word
        resumeResultArea.querySelector('.jh-export-word-btn').addEventListener('click', () => {
          const jobTitle = (jobInfo && jobInfo.title) ? jobInfo.title : '简历';
          exportResumeToWord(resumeHTML, `简历-${jobTitle}.doc`);
        });
        // 导出PDF
        resumeResultArea.querySelector('.jh-export-pdf-btn').addEventListener('click', () => {
          exportResumeToPDF(resumeHTML);
        });
        // 复制到剪贴板
        resumeResultArea.querySelector('.jh-copy-resume-btn').addEventListener('click', () => {
          navigator.clipboard.writeText(tailoredResume).then(() => {
            const copyBtn = resumeResultArea.querySelector('.jh-copy-resume-btn');
            copyBtn.textContent = '已复制';
            setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
          });
        });
        genBtn.style.display = 'none';
      } catch (error) {
        genBtn.disabled = false;
        genBtn.textContent = '生成针对性简历';
        resumeResultArea.style.display = 'block';
        resumeResultArea.innerHTML = `<div class="jh-resume-error">生成失败: ${error.message}</div>`;
      }
    });
  }

  // 关闭
  const close = () => modal.remove();
  modal.querySelector('.jh-modal-close').addEventListener('click', close);
  modal.querySelector('.jh-modal-overlay').addEventListener('click', close);
  // ESC关闭
  const escHandler = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}

function showLoading(container) {
  const panel = container.querySelector('.jh-result-panel');
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="jh-loading">
      <div class="jh-spinner"></div>
      <span>正在分析岗位...</span>
    </div>
  `;
}

function showError(container, message) {
  const panel = container.querySelector('.jh-result-panel');
  panel.style.display = 'block';
  const needRefresh = message.includes('刷新页面');
  panel.innerHTML = `
    <div class="jh-error">
      <span>分析失败: ${message}</span>
      ${needRefresh ? '<button class="jh-refresh-btn">刷新页面</button>' : '<button class="jh-retry-btn">重试</button>'}
    </div>
  `;

  const refreshBtn = panel.querySelector('.jh-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => window.location.reload());
  }
  const retryBtn = panel.querySelector('.jh-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      const jobCard = container.parentElement;
      analyzeJob(jobCard, container);
    });
  }
}

// ==================== 核心分析逻辑 ====================

// 安全发送消息，处理Extension context invalidated错误
async function safeSendMessage(msg) {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch (e) {
    if (e.message && e.message.includes('Extension context invalidated')) {
      throw new Error('插件已更新，请刷新页面后重试');
    }
    throw e;
  }
}

// ==================== 本地规则粗筛（不消耗LLM算力） ====================

// 高风险关键词列表
const HIGH_RISK_KEYWORDS = [
  '轻松月入', '日入过万', '月入过万', '躺赚', '零门槛', '无需经验即可高薪',
  '交费入职', '押金', '培训费', '入职需交', '先交钱',
  '兼职刷单', '刷信誉', '刷销量', '点赞赚钱',
  '高薪急招', '急招日结', '当天结算', '日结工资',
  '免费带你', '包教包会包就业', '零基础月入'
];

// 薪资异常检测：薪资范围中值明显偏离市场水平
function isSalaryAbnormal(salaryText) {
  if (!salaryText) return false;
  // 匹配 "XX-XXK" 格式
  const match = salaryText.match(/(\d+)\s*[-~至]\s*(\d+)\s*K/i);
  if (match) {
    const low = parseInt(match[1]);
    const high = parseInt(match[2]);
    // 上限超过100K且低端不到50K（薪资范围过宽，典型虚高信号）
    if (high >= 100 && low < 50) return true;
    // 范围超过4倍（如 5-40K）
    if (high > low * 4 && high >= 30) return true;
  }
  // 匹配 "XX-XX元/天" 格式
  const dayMatch = salaryText.match(/(\d+)\s*[-~至]\s*(\d+)\s*元\/天/);
  if (dayMatch) {
    const high = parseInt(dayMatch[2]);
    if (high >= 1000) return true; // 日薪超1000元，可疑
  }
  return false;
}

// 本地粗筛：纯规则判断，不调用LLM
function quickFilter(jobInfo) {
  const reasons = [];
  let riskLevel = 'low';

  const text = (jobInfo.summary || '') + ' ' + (jobInfo.title || '') + ' ' + (jobInfo.tags || '');
  const lowerText = text.toLowerCase();

  // 1. 高风险关键词检测
  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      reasons.push(`检测到高风险关键词："${keyword}"`);
      riskLevel = 'high';
    }
  }

  // 2. 薪资异常检测
  if (isSalaryAbnormal(jobInfo.salary)) {
    reasons.push(`薪资范围异常："${jobInfo.salary}"，疑似虚高`);
    riskLevel = 'high';
  }

  // 3. 公司信息缺失检测
  if (!jobInfo.company || jobInfo.company.trim().length === 0) {
    reasons.push('公司信息缺失');
    riskLevel = riskLevel === 'high' ? 'high' : 'medium';
  }

  // 4. 职位名称可疑（过短、含特殊字符等）
  if (jobInfo.title && (jobInfo.title.length < 2 || /[★☆♦♠♥●○]/.test(jobInfo.title))) {
    reasons.push(`职位名称可疑："${jobInfo.title}"`);
    riskLevel = riskLevel === 'high' ? 'high' : 'medium';
  }

  return {
    passed: riskLevel !== 'high',
    riskLevel,
    reasons
  };
}

// ==================== 逐岗位分析 ====================

async function analyzeJob(jobCard, container) {
  const jobInfo = extractJobInfo(jobCard);

  if (!jobInfo.summary && !jobInfo.title) {
    showError(container, '无法提取岗位信息');
    return;
  }

  showLoading(container);

  try {
    // 第零步：本地规则粗筛（不消耗LLM算力）
    const filterResult = quickFilter(jobInfo);
    if (!filterResult.passed) {
      // 粗筛未通过，直接显示结果，不调用LLM
      showAnalysisResult(container, {
        riskLevel: filterResult.riskLevel,
        riskReasons: filterResult.reasons.join('；'),
        matchScore: null,
        matchDetails: '高风险岗位已过滤，不进行匹配分析',
        suggestions: ''
      });
      return;
    }

    // 第一步：LLM风险精筛（粗筛通过后才调用）
    const riskResult = await analyzeRisk(jobInfo);
    // 如果LLM也判定高风险，同样跳过匹配分析
    if (riskResult.riskLevel === 'high') {
      showAnalysisResult(container, {
        ...riskResult,
        matchScore: null,
        matchDetails: '高风险岗位已过滤，不进行匹配分析',
        suggestions: ''
      });
      return;
    }

    // 第二步：LLM匹配度评分
    const resumeResponse = await safeSendMessage({ type: 'GET_RESUME' });
    const resume = resumeResponse.success ? resumeResponse.data : '';

    let matchResult = { matchScore: null, matchDetails: '', suggestions: '' };
    if (resume) {
      matchResult = await analyzeMatch(jobInfo, resume);
      // 匹配度过低也跳过简历建议
      if (matchResult.matchScore !== null && matchResult.matchScore < 30) {
        matchResult.suggestions = '匹配度极低，建议跳过此岗位';
      }
    }

    showAnalysisResult(container, { ...riskResult, ...matchResult });
  } catch (error) {
    showError(container, error.message);
  }
}

async function analyzeRisk(jobInfo) {
  const jobText = jobInfo.summary || [jobInfo.title, jobInfo.salary, jobInfo.company, jobInfo.tags, jobInfo.description].filter(Boolean).join(' | ');

  const messages = [
    {
      role: 'system',
      content: `你是求职安全分析师。分析招聘信息的隐藏风险（明显风险已被粗筛过滤）。

关注：薪资虚高、公司异常、描述模糊、隐形陷阱等细微信号。

用JSON回复（不要其他文字）：
{"riskLevel":"low/medium/high","riskReasons":"风险说明"}`
    },
    {
      role: 'user',
      content: jobText
    }
  ];

  const response = await safeSendMessage({
    type: 'CALL_LLM',
    data: { messages, temperature: 0.2 }
  });

  if (!response.success) throw new Error(response.error);

  try {
    let content = response.data.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) content = jsonMatch[0];
    return JSON.parse(content);
  } catch (e) {
    return { riskLevel: 'medium', riskReasons: response.data };
  }
}

async function analyzeMatch(jobInfo, resume) {
  const jobText = jobInfo.summary || [jobInfo.title, jobInfo.salary, jobInfo.company, jobInfo.tags, jobInfo.description].filter(Boolean).join(' | ');
  const resumeShort = resume.length > 800 ? resume.substring(0, 800) + '...(已截断)' : resume;

  const messages = [
    {
      role: 'system',
      content: `你是职业匹配分析师。评估简历与岗位的匹配度。

关注：技能匹配、经验匹配、学历匹配。

用JSON回复（不要其他文字）：
{"matchScore":0-100,"matchDetails":"匹配项和缺失项","suggestions":"简历修改建议，匹配度低则建议跳过"}`
    },
    {
      role: 'user',
      content: `岗位：${jobText}\n简历：${resumeShort}`
    }
  ];

  const response = await safeSendMessage({
    type: 'CALL_LLM',
    data: { messages, temperature: 0.3 }
  });

  if (!response.success) throw new Error(response.error);

  try {
    let content = response.data.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) content = jsonMatch[0];
    return JSON.parse(content);
  } catch (e) {
    return { matchScore: 50, matchDetails: response.data, suggestions: '' };
  }
}

// ==================== 生成针对性简历 ====================

async function generateTailoredResume(jobInfo, suggestions) {
  const jobText = jobInfo.summary || [jobInfo.title, jobInfo.salary, jobInfo.company, jobInfo.tags, jobInfo.description].filter(Boolean).join(' | ');

  // 获取用户原始简历
  const resumeResponse = await safeSendMessage({ type: 'GET_RESUME' });
  const resume = resumeResponse.success ? resumeResponse.data : '';

  if (!resume) {
    throw new Error('请先在设置中填写原始简历');
  }

  const resumeShort = resume.length > 1200 ? resume.substring(0, 1200) + '...(已截断)' : resume;

  const messages = [
    {
      role: 'system',
      content: `你是资深简历优化师。根据目标岗位要求，对原始简历进行针对性修改，生成优化后的简历。

要求：
1. 突出与岗位匹配的技能和经验
2. 调整经历描述顺序，把最相关的放前面
3. 量化成果，补充关键数据
4. 删除与岗位无关的内容
5. 保持简历真实，不编造经历

用Markdown格式输出简历，严格按以下结构：

## 姓名 | 求职岗位
联系电话 | 邮箱

### 个人简介
2-3句话概括核心优势

### 工作经历
**公司名 | 职位** | 起止时间
- 成果描述1
- 成果描述2

### 教育背景
**学校名 | 专业** | 起止时间

### 技能专长
- 技能类别1：技能A、技能B、技能C
- 技能类别2：技能D、技能E

只输出简历内容，不要加其他说明。`
    },
    {
      role: 'user',
      content: `目标岗位：${jobText}\n\n优化建议：${suggestions || '无'}\n\n原始简历：\n${resumeShort}`
    }
  ];

  const response = await safeSendMessage({
    type: 'CALL_LLM',
    data: { messages, temperature: 0.5 }
  });

  if (!response.success) throw new Error(response.error);
  return response.data;
}

// ==================== 简历Markdown解析与导出 ====================

// 简易Markdown→HTML转换（专为简历格式设计）
function parseMarkdownToHTML(markdown) {
  let html = markdown;

  // 转义HTML特殊字符（保留后续Markdown处理）
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ## 标题 → <h2>
  html = html.replace(/^## (.+)$/gm, '<h2 class="resume-h2">$1</h2>');
  // ### 标题 → <h3>
  html = html.replace(/^### (.+)$/gm, '<h3 class="resume-h3">$1</h3>');

  // **粗体** → <strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // --- 分隔线 → <hr>
  html = html.replace(/^---+$/gm, '<hr class="resume-hr">');

  // 无序列表：连续的 - 行合并为 <ul><li>...</li></ul>
  html = html.replace(/(?:^(- .+)$\n?)+/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      const content = line.replace(/^- /, '');
      return `<li>${content}</li>`;
    }).join('');
    return `<ul class="resume-ul">${items}</ul>`;
  });

  // 普通段落：非空行、非标签行 → <p>
  const lines = html.split('\n');
  const processed = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      processed.push('');
      continue;
    }
    // 已经是HTML标签的行不处理
    if (/^<(h[1-6]|ul|li|hr|div|p)/.test(line)) {
      processed.push(line);
    } else {
      processed.push(`<p class="resume-p">${line}</p>`);
    }
  }
  html = processed.join('\n');

  // 清理多余空行
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}

// Word导出内嵌样式
const RESUME_WORD_STYLES = `
  <style>
    body { font-family: '微软雅黑', 'Microsoft YaHei', sans-serif; color: #2c3e50; padding: 40px; line-height: 1.8; }
    h2.resume-h2 { font-size: 22px; color: #1a5276; border-bottom: 2px solid #2980b9; padding-bottom: 6px; margin: 20px 0 10px; }
    h3.resume-h3 { font-size: 15px; color: #2c3e50; margin: 16px 0 8px; border-left: 3px solid #2980b9; padding-left: 10px; }
    .resume-p { margin: 4px 0; font-size: 13px; }
    ul.resume-ul { margin: 4px 0 8px 18px; padding: 0; }
    ul.resume-ul li { font-size: 13px; margin: 3px 0; line-height: 1.7; }
    strong { color: #1a5276; }
    hr.resume-hr { border: none; border-top: 1px solid #d5dbdb; margin: 12px 0; }
  </style>
`;

// 导出为Word（.doc，HTML格式，Word/WPS可打开编辑）
function exportResumeToWord(htmlContent, filename) {
  const fullHTML = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      ${RESUME_WORD_STYLES}
    </head>
    <body>${htmlContent}</body>
    </html>
  `;
  const blob = new Blob(['\ufeff' + fullHTML], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || '针对性简历.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 导出为PDF（通过打印对话框）
function exportResumeToPDF(htmlContent) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('请允许弹出窗口以导出PDF');
    return;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>针对性简历</title>
      ${RESUME_WORD_STYLES}
      <style>
        @media print {
          body { padding: 20px; }
          @page { margin: 15mm; }
        }
      </style>
    </head>
    <body>${htmlContent}</body>
    </html>
  `);
  printWindow.document.close();
  // 等内容渲染后触发打印
  printWindow.onload = () => { printWindow.print(); };
  // 兜底：延迟打印
  setTimeout(() => { try { printWindow.print(); } catch(e) {} }, 1000);
}

// ==================== 页面初始化 ====================

function observeJobCards() {
  const selectors = {
    boss: '.job-card-wrap, .job-card-box',
    lagou: '.item__10RTO, [class*="item__"]'
  };

  const platform = detectPlatform();
  const selector = selectors[platform] || '.job-card-wrap, .job-card-box, [class*="job-card"]';

  // 初始注入
  document.querySelectorAll(selector).forEach(card => {
    try { injectAnalysisUI(card); } catch (e) {}
  });

  // MutationObserver监听新增节点
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches && node.matches(selector)) {
            injectAnalysisUI(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll(selector).forEach(card => {
              injectAnalysisUI(card);
            });
          }
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function injectDetailPageButton() {
  const isDetailPage = detectPlatform() === 'boss'
    ? window.location.pathname.includes('/job_detail/')
    : window.location.pathname.includes('/jobs/');

  if (!isDetailPage) return;
  if (document.querySelector('.jh-detail-analyze-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'jh-detail-analyze-btn';
  btn.textContent = '分析此岗位';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '分析中...';

    try {
      const jobInfo = extractJobDetailFromPage();
      const resumeResponse = await safeSendMessage({ type: 'GET_RESUME' });
      const resume = resumeResponse.success ? resumeResponse.data : '';

      const riskResult = await analyzeRisk(jobInfo);
      let matchResult = { matchScore: null, matchDetails: '', suggestions: '' };
      if (resume) {
        matchResult = await analyzeMatch(jobInfo, resume);
      }

      showDetailPageResult({ ...riskResult, ...matchResult });
    } catch (error) {
      alert('分析失败: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '分析此岗位';
    }
  });

  document.body.appendChild(btn);
}

function showDetailPageResult(result) {
  const oldPanel = document.querySelector('.jh-detail-result');
  if (oldPanel) oldPanel.remove();

  let riskClass = 'jh-risk-low';
  let riskLabel = '低风险';
  if (result.riskLevel === 'high') { riskClass = 'jh-risk-high'; riskLabel = '高风险'; }
  else if (result.riskLevel === 'medium') { riskClass = 'jh-risk-medium'; riskLabel = '中风险'; }

  let matchClass = 'jh-match-low';
  if (result.matchScore >= 70) matchClass = 'jh-match-high';
  else if (result.matchScore >= 40) matchClass = 'jh-match-medium';

  // 详情页直接弹出大面板，传入当前页面岗位信息
  const jobInfo = extractJobDetailFromPage();
  showDetailModal(result, riskClass, riskLabel, matchClass, jobInfo);
}

// 监听来自Popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TRIGGER_ANALYZE') {
    // 优先触发详情页分析
    const detailBtn = document.querySelector('.jh-detail-analyze-btn');
    if (detailBtn) {
      detailBtn.click();
      sendResponse({ success: true });
    } else {
      // 列表页：逐个串行分析岗位卡片，避免并发请求超出模型承受
      const cards = document.querySelectorAll('.job-card-wrap, .job-card-box');
      if (cards.length > 0) {
        // 收集所有未分析卡片的按钮
        const pendingBtns = [];
        cards.forEach(card => {
          const container = card.querySelector('.jh-analysis-container');
          if (container) {
            const btn = container.querySelector('.jh-analyze-btn');
            if (btn && btn.style.display !== 'none') {
              pendingBtns.push(btn);
            }
          }
        });

        if (pendingBtns.length === 0) {
          sendResponse({ success: true, analyzed: 0, message: '所有岗位已分析完毕' });
          return true;
        }

        // 逐个串行点击，每个等上一个完成后再点下一个
        let idx = 0;
        function analyzeNext() {
          if (idx >= pendingBtns.length) return;
          const btn = pendingBtns[idx];
          idx++;
          btn.click();
          // 等待该卡片分析完成（结果面板出现或按钮消失）后再分析下一个
          const checkDone = setInterval(() => {
            const container = btn.closest('.jh-analysis-container');
            if (!container) { clearInterval(checkDone); analyzeNext(); return; }
            const panel = container.querySelector('.jh-result-panel');
            // 结果面板已显示且不在加载状态
            if (panel && panel.style.display !== 'none' && !panel.querySelector('.jh-loading') && !panel.querySelector('.jh-error')) {
              clearInterval(checkDone);
              // 间隔1秒再分析下一个，给模型喘息时间
              setTimeout(analyzeNext, 1000);
            }
          }, 500);
          // 超时保护：单岗位最多等30秒
          setTimeout(() => { clearInterval(checkDone); analyzeNext(); }, 30000);
        }
        analyzeNext();
        sendResponse({ success: true, analyzed: pendingBtns.length, message: `开始逐个分析${pendingBtns.length}个岗位` });
      } else {
        sendResponse({ success: false, error: '未找到岗位卡片，请先进入招聘搜索页面' });
      }
    }
    return true;
  }
});

// 初始化
function init() {
  setTimeout(() => {
    observeJobCards();
    injectDetailPageButton();
  }, 1000);
}

init();