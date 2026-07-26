import { apiJson, firstArray } from '@/src/lib/api';
import type {
  ApiKeyItem,
  ApiRecord,
  BalanceInfo,
  ModelItem,
  PlanItem,
  RequestLogItem,
  UsageOverview,
  UsageTrendItem,
  UserProfile,
} from '@/src/types/api';

// ---- Profile ----

export async function getProfile(signal?: AbortSignal) {
  const payload = await apiJson<ApiRecord>('/profile', { signal });
  const nested = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const inner = nested.user ?? nested.profile ?? nested.data ?? nested;
  return (inner && typeof inner === 'object' && !Array.isArray(inner) ? inner : {}) as UserProfile;
}

export function updateProfile(value: ApiRecord) {
  return apiJson<ApiRecord>('/profile', { method: 'PUT', body: JSON.stringify(value) });
}

export function deleteProfile() {
  return apiJson<ApiRecord>('/profile', { method: 'DELETE' });
}

// ---- Key overview (API Key 登录) ----

export function getKeyOverview(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/key-overview/overview', { signal });
}

// ---- API Keys ----

export async function getApiKeys(signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/keys', { signal });
  return firstArray<ApiKeyItem>(payload, ['keys', 'items', 'data', 'list']);
}

export function createApiKey(input: { name: string; expires_at?: string | null; scopes?: string[] }) {
  const body: ApiRecord = { name: input.name.trim() };
  if (input.expires_at) body.expires_at = input.expires_at;
  if (input.scopes?.length) body.scopes = input.scopes;
  return apiJson<ApiRecord>('/keys', { method: 'POST', body: JSON.stringify(body) });
}

export function updateApiKey(id: string | number, value: ApiRecord) {
  return apiJson<ApiRecord>(`/keys/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify(value) });
}

export function deleteApiKey(id: string | number) {
  return apiJson<ApiRecord>(`/keys/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
}

export function extractKeySecret(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as ApiRecord;
  for (const candidate of [record.secret, record.key, record.api_key, record.token]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  for (const nested of [record.data, record.item]) {
    if (nested && typeof nested === 'object') {
      const inner = extractKeySecret(nested);
      if (inner) return inner;
    }
  }
  return '';
}

// ---- Models ----

export async function getModels(signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/models', { signal });
  return firstArray<ModelItem>(payload, ['models', 'data', 'items', 'list']);
}

export function getModelVisibility(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/models/visibility', { signal });
}

export function setModelVisibility(value: ApiRecord) {
  return apiJson<ApiRecord>('/models/visibility', { method: 'PUT', body: JSON.stringify(value) });
}

// ---- Plans & balance ----

export async function getPlans(signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/plans', { signal });
  return firstArray<PlanItem>(payload, ['plans', 'data', 'items', 'list']);
}

export async function getBalance(signal?: AbortSignal) {
  const payload = await apiJson<ApiRecord>('/users/me/balance', { signal });
  const inner = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data as ApiRecord
    : payload;
  return (inner ?? {}) as BalanceInfo;
}

// ---- Usage ----

export async function getUsageOverview(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const payload = await apiJson<ApiRecord>('/usage/overview', { signal, query: params });
  const inner = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as ApiRecord
    : payload;
  return (inner ?? {}) as UsageOverview;
}

export async function getUsageTrend(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/usage/trend', { signal, query: params });
  return firstArray<UsageTrendItem>(payload, ['trend', 'items', 'data', 'buckets', 'list']);
}

export function getUsageAnalysis(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  return apiJson<ApiRecord>('/usage/analysis', { signal, query: params });
}

export function getUsageQuotaLimit(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/usage/quota/limit', { signal });
}

// ---- Request logs ----

export type RequestLogPage = {
  items: RequestLogItem[];
  nextCursor: string;
  raw: unknown;
};

export async function getRequests(params?: { limit?: number; cursor?: string; q?: string; model?: string; status?: string }, signal?: AbortSignal): Promise<RequestLogPage> {
  const payload = await apiJson<unknown>('/requests', { signal, query: params });
  const items = firstArray<RequestLogItem>(payload, ['requests', 'items', 'data', 'list', 'logs']);
  let nextCursor = '';
  if (payload && typeof payload === 'object') {
    const record = payload as ApiRecord;
    for (const key of ['next_cursor', 'nextCursor', 'cursor']) {
      if (typeof record[key] === 'string' && record[key]) {
        nextCursor = record[key] as string;
        break;
      }
    }
  }
  return { items, nextCursor, raw: payload };
}
