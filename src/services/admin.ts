import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord, BalanceInfo, ModelItem, RequestLogItem, UsageOverview, UsageTrendItem, UserProfile } from '@/src/types/api';

export type AdminUserItem = UserProfile & {
  balance?: number;
  last_login_at?: string | null;
};

// ---- Users ----

export async function getAdminUsers(params?: { q?: string; limit?: number; cursor?: string }, signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/admin/users', { signal, query: params });
  return { items: firstArray<AdminUserItem>(payload, ['users', 'items', 'data', 'list']), raw: payload };
}

export function getAdminUser(id: string | number, signal?: AbortSignal) {
  return apiJson<ApiRecord>(`/admin/users/${encodeURIComponent(String(id))}`, { signal });
}

export function updateAdminUser(id: string | number, value: ApiRecord) {
  return apiJson<ApiRecord>(`/admin/users/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify(value) });
}

export function deleteAdminUser(id: string | number) {
  return apiJson<ApiRecord>(`/admin/users/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
}

export function adjustAdminUserBalance(id: string | number, value: ApiRecord) {
  return apiJson<ApiRecord>(`/admin/users/${encodeURIComponent(String(id))}/balance`, { method: 'POST', body: JSON.stringify(value) });
}

export function createAdminUserSubscription(id: string | number, value: ApiRecord) {
  return apiJson<ApiRecord>(`/admin/users/${encodeURIComponent(String(id))}/subscriptions`, { method: 'POST', body: JSON.stringify(value) });
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

export async function getAdminStatsModels(signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/admin/models', { signal });
  return firstArray<ModelItem>(payload, ['models', 'items', 'data', 'list', 'rows']);
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
