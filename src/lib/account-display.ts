import type { ApiRecord } from '@/src/types/api';

export type UpstreamAccountStatus = 'active' | 'cooldown' | 'rate_limited' | 'error' | 'disabled' | 'suspended' | 'needs_reauth';

export const accountStatusLabels: Record<UpstreamAccountStatus, string> = {
  active: '启用',
  cooldown: '冷却中',
  rate_limited: '限流中',
  error: '异常',
  disabled: '禁用',
  suspended: '已暂停',
  needs_reauth: '需重新登录',
};

const providerDefinitions: Record<string, { label: string; mark: string; color: string }> = {
  codex: { label: 'OpenAI', mark: 'O', color: '#111827' },
  openai: { label: 'OpenAI', mark: 'O', color: '#111827' },
  anthropic: { label: 'Claude', mark: 'C', color: '#d97757' },
  xai: { label: 'Grok', mark: 'G', color: '#111111' },
  kiro: { label: 'Kiro', mark: 'K', color: '#7c3aed' },
  deepseek: { label: 'DeepSeek', mark: 'D', color: '#4f64ff' },
  glm: { label: 'Zhipu', mark: 'Z', color: '#3859ff' },
  chatglm: { label: 'ChatGLM', mark: 'Z', color: '#315efb' },
  zhipu: { label: 'Zhipu', mark: 'Z', color: '#315efb' },
  minimax: { label: 'MiniMax', mark: 'M', color: '#e83e73' },
  kimi: { label: 'Kimi', mark: 'K', color: '#111111' },
  moonshot: { label: 'Kimi', mark: 'K', color: '#111111' },
  mimo: { label: 'Xiaomi MiMo', mark: 'M', color: '#ff6900' },
  opencode: { label: 'OpenCode Zen', mark: 'O', color: '#111111' },
  cursor: { label: 'Cursor', mark: 'C', color: '#111111' },
  qoder: { label: 'Qoder', mark: 'Q', color: '#22c55e' },
  workbuddy: { label: 'WorkBuddy', mark: 'W', color: '#6366f1' },
  qianwen: { label: '千问 Token Plan', mark: '千', color: '#635bdb' },
  qwen: { label: '千问 Token Plan', mark: '千', color: '#635bdb' },
  ark: { label: '火山方舟 Agent Plan', mark: '火', color: '#1677ff' },
  doubao: { label: '火山方舟 Agent Plan', mark: '火', color: '#1677ff' },
  gemini: { label: 'Gemini', mark: 'G', color: '#207cfe' },
  antigravity: { label: 'Antigravity', mark: 'A', color: '#5b6cff' },
  'google-ai-studio': { label: 'Google AI Studio', mark: 'G', color: '#4285f4' },
};

const fallbackColors = ['#2563eb', '#0f766e', '#7c3aed', '#c2410c', '#be123c', '#0369a1'];

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

export function accountProvider(itemOrProvider: ApiRecord | string) {
  const item = typeof itemOrProvider === 'string' ? undefined : itemOrProvider;
  const provider = (typeof itemOrProvider === 'string' ? itemOrProvider : text(itemOrProvider.provider)).toLowerCase();
  const defined = providerDefinitions[provider];
  if (defined) return { key: provider, ...defined };
  const customLabel = item ? text(item.provider_display_name ?? item.provider_label) : '';
  const label = customLabel || provider || '未知提供商';
  let hash = 0;
  for (const character of provider) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { key: provider, label, mark: Array.from(label)[0]?.toUpperCase() ?? 'P', color: fallbackColors[hash % fallbackColors.length] };
}

export function accountIdentity(item: ApiRecord) {
  const label = text(item.label);
  const email = text(item.email);
  if (label) return { primary: label, secondary: email && email !== label ? email : '' };
  return { primary: email || accountProvider(item).label, secondary: '' };
}

function isSuspended(item: ApiRecord) {
  return /suspend/i.test(`${text(item.status_reason)} ${text(item.last_error)}`);
}

export function accountStatus(item: ApiRecord, now = Date.now()): UpstreamAccountStatus {
  const status = text(item.status).toLowerCase();
  if (status === 'needs_reauth') return 'needs_reauth';
  if (status === 'disabled' || status === 'auto_disabled') {
    return isSuspended(item) ? 'suspended' : 'disabled';
  }
  const cooldownUntil = text(item.cooldown_until);
  if (cooldownUntil && new Date(cooldownUntil).getTime() > now) return 'cooldown';
  const error = text(item.last_error);
  if (error) return /^rate limited \(429\)|^quota exhausted \(402\)|usage_limit_reached/i.test(error) ? 'rate_limited' : 'error';
  return 'active';
}

export function accountStatusNeedsAttention(status: UpstreamAccountStatus) {
  return status === 'error' || status === 'needs_reauth' || status === 'suspended';
}

export function accountStatusReason(item: ApiRecord, status = accountStatus(item)) {
  if (status === 'active') return '';
  return text(item.status_reason) || text(item.last_error);
}

function proxyName(item: ApiRecord) {
  return text(item.name) || text(item.host) || text(item.id);
}

export type AccountEgress = { id: string; label: string; direct: boolean; missing: boolean; advanced: boolean };

export function accountEgress(item: ApiRecord, proxies: ApiRecord[], proxiesLoaded: boolean): AccountEgress {
  const selector = text(item.egress_selector);
  const entries = selector.split(',').map((value) => value.trim()).filter(Boolean);
  const advanced = entries.length > 1 || entries.some((value) => value.startsWith('region:'));
  if (advanced) return { id: selector, label: selector, direct: false, missing: false, advanced: true };
  const id = entries[0] || text(item.proxy_id);
  if (!id || id === 'direct') return { id: '', label: '直连', direct: true, missing: false, advanced: false };
  const proxy = proxies.find((candidate) => text(candidate.id) === id);
  return { id, label: proxy ? proxyName(proxy) : id, direct: false, missing: proxiesLoaded && !proxy, advanced: false };
}

export function accountLastUsed(value: unknown, now = Date.now()) {
  const raw = text(value);
  if (!raw) return '从未使用';
  const timestamp = new Date(raw).getTime();
  if (!Number.isFinite(timestamp)) return raw;
  const delta = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return '刚刚';
  if (delta < hour) return `${Math.floor(delta / minute)} 分钟前`;
  if (delta < day) return `${Math.floor(delta / hour)} 小时前`;
  if (delta < 7 * day) return `${Math.floor(delta / day)} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function accountSearchText(item: ApiRecord, proxies: ApiRecord[], proxiesLoaded: boolean) {
  const identity = accountIdentity(item);
  const provider = accountProvider(item);
  const egress = accountEgress(item, proxies, proxiesLoaded);
  return [identity.primary, identity.secondary, provider.key, provider.label, item.plan_label, egress.label, item.last_error, item.status_reason]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
