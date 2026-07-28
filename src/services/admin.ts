import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord, BalanceInfo, ModelItem, RequestLogItem, UsageOverview, UsageTrendItem, UserProfile } from '@/src/types/api';

export type AdminUserItem = UserProfile & {
  balance?: number;
  last_login_at?: string | null;
};

// ---- Users ----

function recordValue(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
}

function unwrapAdminUser(value: unknown, depth = 0): ApiRecord {
  const record = recordValue(value);
  if (depth >= 3) return record;
  for (const key of ['user', 'profile', 'item', 'data']) {
    const nested = recordValue(record[key]);
    if (Object.keys(nested).length) return { ...record, ...unwrapAdminUser(nested, depth + 1) };
  }
  return record;
}

function numericValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractAdminUserBalance(item: ApiRecord) {
  const containers = [
    item,
    recordValue(item.balance),
    recordValue(item.wallet),
    recordValue(item.billing),
    recordValue(item.account),
  ];
  for (const container of containers) {
    for (const key of ['balance', 'balance_usd', 'available_balance', 'wallet_balance', 'credit_balance', 'credit', 'credits', 'amount', 'value']) {
      const balance = numericValue(container[key]);
      if (balance !== undefined) return balance;
    }
    const cents = numericValue(container.balance_cents ?? container.credit_cents);
    if (cents !== undefined) return cents / 100;
    const micros = numericValue(container.balance_micro_usd ?? container.balance_micros);
    if (micros !== undefined) return micros / 1_000_000;
  }
  return undefined;
}

function normalizeAdminUser(value: unknown): AdminUserItem {
  const item = unwrapAdminUser(value) as AdminUserItem;
  const balance = extractAdminUserBalance(item);
  const status = String(item.status ?? '').toLowerCase();
  return {
    ...item,
    name: item.name ?? (typeof item.nickname === 'string' ? item.nickname : undefined),
    disabled: item.disabled ?? (status === 'disabled' || status === 'inactive' || status === 'banned'),
    balance,
  };
}

export async function getAdminUsers(params?: { q?: string; limit?: number; cursor?: string }, signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/admin/users', { signal, query: params });
  const items = firstArray<AdminUserItem>(payload, ['users', 'items', 'data', 'list']).map(normalizeAdminUser);
  return { items, raw: payload };
}

export function updateAdminUser(id: string | number, value: ApiRecord) {
  return apiJson<ApiRecord>(`/admin/users/${encodeURIComponent(String(id))}`, { method: 'PUT', body: JSON.stringify(value) });
}

export function deleteAdminUser(id: string | number) {
  return apiJson<ApiRecord>(`/admin/users/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
}

export function adjustAdminUserBalance(id: string | number, delta: number) {
  return apiJson<ApiRecord>(`/admin/users/${encodeURIComponent(String(id))}/balance`, { method: 'POST', body: JSON.stringify({ delta }) });
}

export function createAdminUserSubscription(id: string | number, planId: string) {
  return apiJson<ApiRecord>(`/admin/users/${encodeURIComponent(String(id))}/subscriptions`, { method: 'POST', body: JSON.stringify({ plan_id: planId }) });
}

// ---- Stats ----

function normalizeStatsParams(params?: { from?: string; to?: string; range?: string }) {
  const range = params?.range === 'day' ? '24h'
    : params?.range === 'week' ? '7d'
      : params?.range === 'month' ? '30d' : params?.range;
  return { ...params, range };
}

export async function getAdminStatsOverview(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const payload = await apiJson<ApiRecord>('/admin/stats/overview', { signal, query: normalizeStatsParams(params) });
  const inner = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as ApiRecord
    : payload;
  const value = (inner ?? {}) as ApiRecord;
  return {
    ...value,
    request_count: Number(value.request_count ?? value.total_requests) || 0,
    total_tokens: Number(value.total_tokens) || 0,
    prompt_tokens: Number(value.prompt_tokens ?? value.input_tokens) || 0,
    completion_tokens: Number(value.completion_tokens ?? value.output_tokens) || 0,
    cost: Number(value.cost ?? value.cost_usd) || 0,
  } as UsageOverview;
}

export async function getAdminStatsTrend(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/admin/stats/trend', { signal, query: normalizeStatsParams(params) });
  return firstArray<UsageTrendItem>(payload, ['trend', 'items', 'data', 'buckets', 'list']).map((value) => ({
    ...value,
    request_count: Number(value.request_count ?? value.requests ?? value.count) || 0,
    total_tokens: Number(value.total_tokens ?? value.tokens) || 0,
    cost: Number(value.cost ?? value.cost_usd) || 0,
  }));
}

export function getAdminRealtimeUsage(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/usage/overview/realtime', { signal });
}

export async function getAdminStatsModels(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const payload = await getAdminStatsAnalysis(params, signal);
  return firstArray<ModelItem>(payload, ['by_model', 'models', 'items', 'data', 'list', 'rows']);
}

export function getAdminStatsAnalysis(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/stats/analysis', { signal, query: normalizeStatsParams(params) });
}

function recordText(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value).trim();
  }
  return '';
}

export async function getAdminStatsUsers(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const [payload, directoryPayload] = await Promise.all([
    getAdminStatsAnalysis(params, signal),
    apiJson<unknown>('/admin/users', { signal, query: { limit: 500 } }).catch(() => undefined),
  ]);
  const rows = firstArray<ApiRecord>(payload, ['by_user', 'users', 'items', 'data', 'list', 'rows']);
  const directory = firstArray<AdminUserItem>(directoryPayload, ['users', 'items', 'data', 'list']).map(normalizeAdminUser);
  const usersById = new Map(directory.flatMap((user) => {
    const id = recordText(user, ['id', 'user_id', 'uuid']);
    return id ? [[id, user] as const] : [];
  }));
  const users = rows.map((item) => {
    const id = recordText(item, ['user_id', 'user', 'id', 'uuid']);
    const profile = usersById.get(id);
    if (!profile) return item;
    const displayName = recordText(profile, ['name', 'nickname', 'username', 'email']);
    return displayName ? { ...item, display_name: displayName } : item;
  });
  const root = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as ApiRecord : {};
  return { ...root, users } as ApiRecord;
}

export async function getAdminQuota(signal?: AbortSignal) {
  const payload = await apiJson<ApiRecord>('/admin/quota', { signal });
  const inner = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as ApiRecord
    : payload;
  return (inner ?? {}) as BalanceInfo;
}

export async function getAdminRequestLogs(params?: { limit?: number }, signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/admin/usage/events', {
    signal,
    query: { range: '7d', page: 1, page_size: params?.limit ?? 20 },
  });
  return {
    items: firstArray<RequestLogItem>(payload, ['requests', 'logs', 'items', 'data', 'list', 'rows']).map((value) => ({
      ...value,
      prompt_tokens: Number(value.prompt_tokens ?? value.input_tokens) || 0,
      completion_tokens: Number(value.completion_tokens ?? value.output_tokens) || 0,
      total_tokens: Number(value.total_tokens) || 0,
      cost: Number(value.cost ?? value.cost_usd) || 0,
      error: value.error ?? (value.failed ? '请求失败' : null),
    })),
    nextCursor: '',
    raw: payload,
  };
}

export function getAdminUsageEvents(params?: { range?: string; page?: number; page_size?: number }, signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/usage/events', { signal, query: params });
}

export function getAdminLogsRequests(params?: { page?: number; page_size?: number }, signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/usage/events', { signal, query: { range: '7d', ...params } });
}

// ---- Models ----

export async function getAdminModels(signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/admin/models', { signal });
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const outer = payload as ApiRecord;
    const root = outer.data && typeof outer.data === 'object' && !Array.isArray(outer.data) ? outer.data as ApiRecord : outer;
    const providers = Array.isArray(root.providers) ? root.providers : [];
    const grouped = providers.flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const provider = value as ApiRecord;
      const models = Array.isArray(provider.models) ? provider.models : Array.isArray(provider.items) ? provider.items : [];
      const providerValue = provider.name ?? provider.provider ?? provider.id;
      return models.flatMap((model) => model && typeof model === 'object' && !Array.isArray(model)
        ? [{ ...(model as ApiRecord), provider: (model as ApiRecord).provider ?? providerValue }]
        : []);
    });
    if (grouped.length) return grouped;
  }
  return firstArray<ApiRecord>(payload, ['models', 'items', 'data', 'list', 'rows']);
}

export function createAdminModel(value: ApiRecord) {
  return apiJson<ApiRecord>('/admin/models', { method: 'PUT', body: JSON.stringify(value) });
}

export function updateAdminModel(id: string, value: ApiRecord) {
  return apiJson<ApiRecord>('/admin/models', { method: 'PUT', body: JSON.stringify({ ...value, id }) });
}

export function deleteAdminModel(id: string, provider: string) {
  return apiJson<ApiRecord>('/admin/models', { method: 'DELETE', query: { id, provider } });
}

export function runAdminModelAction(action: 'sync' | 'probe' | 'cleanup', value: ApiRecord = {}) {
  return apiJson<ApiRecord>(`/admin/models/${action}`, { method: 'POST', body: JSON.stringify(value), timeoutMs: 60000 });
}

export function setAdminModelsEnabled(value: ApiRecord) {
  return apiJson<ApiRecord>('/admin/models/enabled', { method: 'PUT', body: JSON.stringify(value) });
}

export function getAdminModelWarnings(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/snapshot/warnings', { signal });
}

// ---- Quota ----

export function refreshAdminQuota(value: ApiRecord = {}) {
  return apiJson<ApiRecord>('/admin/quota/refresh', { method: 'POST', body: JSON.stringify(value), timeoutMs: 60000 });
}

// ---- Configuration ----

export function getAdminConfig(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/config', { signal });
}

export function updateAdminConfig(value: ApiRecord) {
  return apiJson<ApiRecord>('/admin/config', { method: 'PUT', body: JSON.stringify(value) });
}

export function validateAdminConfig(value: ApiRecord) {
  return apiJson<ApiRecord>('/admin/config/validate', { method: 'POST', body: JSON.stringify(value) });
}

export function getAdminEmailSettings(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/email/settings', { signal });
}

export function updateAdminEmailSettings(value: ApiRecord) {
  return apiJson<ApiRecord>('/admin/email/settings', { method: 'PUT', body: JSON.stringify(value) });
}

export function runAdminEmailAction(action: 'test' | 'preview', value: ApiRecord) {
  return apiJson<ApiRecord>(`/admin/email/${action}`, { method: 'POST', body: JSON.stringify(value) });
}

export function getAdminEmailTemplateDefaults(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/email/templates/defaults', { signal });
}

export function getAdminGithubSettings(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/github/settings', { signal });
}

export function updateAdminGithubSettings(value: ApiRecord) {
  return apiJson<ApiRecord>('/admin/github/settings', { method: 'PUT', body: JSON.stringify(value) });
}

// ---- System ----

export function getAdminSystemInfo(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/system/info', { signal });
}

export function checkAdminUpdates(force = false, signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/system/check-updates', { signal, query: { force: force ? 'true' : 'false' } });
}

export function runAdminSystemAction(action: 'update' | 'restart' | 'rollback') {
  return apiJson<ApiRecord>(`/admin/system/${action}`, { method: 'POST', timeoutMs: 60000 });
}

export function getAdminUpdateSettings(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/system/update-settings', { signal });
}

export function updateAdminUpdateSettings(value: ApiRecord) {
  return apiJson<ApiRecord>('/admin/system/update-settings', { method: 'PUT', body: JSON.stringify(value) });
}

// ---- Logs ----

export async function getAdminAppLogs(params?: { limit?: number }, signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/admin/logs/app', { signal, query: params });
  if (typeof payload === 'string') {
    return payload.split(/\r?\n/).filter((line) => line.trim().length > 0);
  }
  return firstArray<unknown>(payload, ['logs', 'lines', 'items', 'data', 'list'])
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const record = item as ApiRecord;
        for (const key of ['message', 'msg', 'line', 'text', 'log']) {
          if (typeof record[key] === 'string') return record[key] as string;
        }
        return JSON.stringify(record);
      }
      return String(item ?? '');
    })
    .filter((line) => line.trim().length > 0);
}
