import { apiJson, firstArray } from '@/src/lib/api';
import type { ApiRecord, UsageOverview, UsageTrendItem, UserProfile } from '@/src/types/api';

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

export async function getAdminStatsOverview(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const payload = await apiJson<ApiRecord>('/admin/stats/overview', { signal, query: params });
  const inner = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as ApiRecord
    : payload;
  return (inner ?? {}) as UsageOverview;
}

export async function getAdminStatsTrend(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/admin/stats/trend', { signal, query: params });
  return firstArray<UsageTrendItem>(payload, ['trend', 'items', 'data', 'buckets', 'list']);
}

export function getAdminRealtimeUsage(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/admin/usage/overview/realtime', { signal });
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
