/**
 * AI 分析服务 — 支持 OpenAI / Claude / DeepSeek / 通义千问
 */

const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    header: 'Authorization',
    prefix: 'Bearer '
  },
  claude: {
    name: 'Claude',
    baseURL: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-6',
    header: 'x-api-key',
    prefix: '',
    extraHeaders: { 'anthropic-version': '2023-06-01' }
  },
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    header: 'Authorization',
    prefix: 'Bearer '
  },
  qwen: {
    name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
    header: 'Authorization',
    prefix: 'Bearer '
  }
};

const CATEGORIES = [
  { name: '技术文章', icon: '💻' },
  { name: '视频', icon: '📺' },
  { name: '阅读', icon: '📖' },
  { name: '购物', icon: '🛒' },
  { name: '工具', icon: '🔧' },
  { name: '新闻', icon: '📰' },
  { name: '音乐', icon: '🎵' },
  { name: '其他', icon: '📌' }
];

async function analyzeURL(url, providerKey = 'openai') {
  const apiKey = await getSetting('api_key_' + providerKey);
  if (!apiKey) throw new Error('请先在设置中配置 ' + AI_PROVIDERS[providerKey].name + ' 的 API Key');

  const provider = AI_PROVIDERS[providerKey];
  const categoryList = CATEGORIES.map(c => c.icon + ' ' + c.name).join(', ');

  const prompt = `分析以下链接的内容，返回纯 JSON（不要包含 markdown 代码块标记）：
{
  "title": "文章标题（简洁准确，不超过30字）",
  "summary": "内容摘要（不超过200字，用中文）",
  "category": "分类名称（从以下选最匹配的：${categoryList}）",
  "tags": ["标签1", "标签2", "标签3"]
}
链接：${url}`;

  const body = {
    model: provider.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 600,
    temperature: 0.3
  };

  const headers = {
    'Content-Type': 'application/json',
    [provider.header]: provider.prefix + apiKey,
    ...(provider.extraHeaders || {})
  };

  const response = await fetch(provider.baseURL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (response.status === 401) throw new Error('API Key 无效，请检查设置');
  if (!response.ok) throw new Error('请求失败（状态码：' + response.status + '）');

  const json = await response.json();

  // 解析不同格式的响应
  let content;
  if (json.choices?.[0]?.message?.content) {
    content = json.choices[0].message.content;
  } else if (json.content?.[0]?.text) {
    content = json.content[0].text;
  } else if (json.output?.choices?.[0]?.message?.content) {
    content = json.output.choices[0].message.content;
  } else {
    throw new Error('无法解析 AI 返回内容');
  }

  // 清理 markdown 标记
  const cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('AI 返回内容格式异常，请重试');
  }
}

function getActiveProvider() {
  return getSetting('ai_provider').then(p => p || 'openai');
}
