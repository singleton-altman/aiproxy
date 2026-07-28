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

export async function getProfile(signal?: AbortSignal, baseUrl?: string) {
  const payload = await apiJson<ApiRecord>('/user/me', { signal, baseUrl });
  const nested = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const inner = nested.user ?? nested.profile ?? nested.data ?? nested;
  const profile = (inner && typeof inner === 'object' && !Array.isArray(inner) ? inner : {}) as UserProfile;
  return { ...profile, name: profile.name ?? (typeof profile.nickname === 'string' ? profile.nickname : undefined) };
}

export function updateProfile(value: ApiRecord) {
  const nickname = value.nickname ?? value.name;
  return apiJson<ApiRecord>('/user/me', { method: 'PATCH', body: JSON.stringify({ nickname }) });
}

// ---- Key overview (API Key 登录) ----

export function getKeyOverview(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/key-overview/overview', { signal });
}

// ---- API Keys ----

export async function getApiKeys(signal?: AbortSignal) {
  const [payload, requestPage] = await Promise.all([
    apiJson<unknown>('/user/keys', { signal }),
    getRequests({ limit: 100 }, signal).catch(() => undefined),
  ]);
  const latestUseByKey = new Map<string, string>();
  for (const event of requestPage?.items ?? []) {
    const record = event as ApiRecord;
    const id = record.api_key_id ?? record.key_id ?? record.apiKeyId;
    const usedAt = record.created_at ?? record.requested_at ?? record.started_at ?? record.timestamp;
    if (id === undefined || id === null || !usedAt) continue;
    const key = String(id);
    const candidate = String(usedAt);
    const current = latestUseByKey.get(key);
    if (!current || new Date(candidate).getTime() > new Date(current).getTime()) latestUseByKey.set(key, candidate);
  }
  return firstArray<ApiKeyItem>(payload, ['keys', 'items', 'data', 'list']).map((item) => {
    const record = item as ApiRecord;
    const id = item.id === undefined ? '' : String(item.id);
    const lastUsed = item.last_used_at
      ?? record.last_used
      ?? record.lastUsedAt
      ?? record.last_request_at
      ?? record.last_active_at
      ?? latestUseByKey.get(id);
    const usageCount = Number(record.usage_count ?? record.request_count ?? record.total_requests);
    return {
      ...item,
      disabled: item.disabled ?? item.status === 'disabled',
      last_used_at: lastUsed ? String(lastUsed) : null,
      usage_count: Number.isFinite(usageCount) ? usageCount : undefined,
    };
  });
}

export function createApiKey(input: { name: string; expires_at?: string | null; scopes?: string[] }) {
  const body: ApiRecord = { name: input.name.trim() };
  if (input.expires_at) body.expires_at = input.expires_at;
  if (input.scopes?.length) body.scopes = input.scopes;
  return apiJson<ApiRecord>('/user/keys', { method: 'POST', body: JSON.stringify(body) });
}

export function updateApiKey(id: string | number, value: ApiRecord) {
  const body = typeof value.disabled === 'boolean'
    ? { status: value.disabled ? 'disabled' : 'active' }
    : value;
  return apiJson<ApiRecord>(`/user/keys/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteApiKey(id: string | number) {
  return apiJson<ApiRecord>(`/user/keys/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
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
  const payload = await apiJson<unknown>('/user/models', { signal });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const providers = (payload as ApiRecord).providers;
  if (!Array.isArray(providers)) return firstArray<ModelItem>(payload, ['models', 'data', 'items', 'list']);
  return providers.flatMap((provider) => {
    if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return [];
    const group = provider as ApiRecord;
    const models = Array.isArray(group.models) ? group.models : [];
    return models.flatMap((model) => {
      if (!model || typeof model !== 'object' || Array.isArray(model)) return [];
      const item = model as ApiRecord;
      return [{
        ...item,
        provider: item.provider ?? group.provider,
        owned_by: item.owned_by ?? item.provider ?? group.provider,
        prompt_price_per_1m: item.prompt_price_per_1m ?? item.prompt_per_1m,
        completion_price_per_1m: item.completion_price_per_1m ?? item.completion_per_1m,
      } as ModelItem];
    });
  });
}

export function getModelVisibility(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/user/models', { signal });
}

export function setModelVisibility(value: ApiRecord) {
  return apiJson<ApiRecord>('/user/models/visibility', { method: 'PUT', body: JSON.stringify(value) });
}

// ---- Plans & balance ----

export async function getPlans(signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/user/plans', { signal });
  return firstArray<PlanItem>(payload, ['plans', 'data', 'items', 'list']);
}

export async function getBalance(signal?: AbortSignal) {
  const payload = await apiJson<ApiRecord>('/user/me', { signal });
  const inner = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data as ApiRecord
    : payload;
  return (inner ?? {}) as BalanceInfo;
}

// ---- Usage ----

function normalizeRange(range?: string) {
  if (range === 'day') return '24h';
  if (range === 'week') return '7d';
  if (range === 'month') return '30d';
  return range;
}

function normalizeUsageOverview(value: ApiRecord): UsageOverview {
  return {
    ...value,
    request_count: Number(value.request_count ?? value.total_requests) || 0,
    total_tokens: Number(value.total_tokens) || 0,
    prompt_tokens: Number(value.prompt_tokens ?? value.input_tokens) || 0,
    completion_tokens: Number(value.completion_tokens ?? value.output_tokens) || 0,
    cost: Number(value.cost ?? value.cost_usd) || 0,
  };
}

function normalizeTrendItem(value: UsageTrendItem): UsageTrendItem {
  return {
    ...value,
    request_count: Number(value.request_count ?? value.requests ?? value.count) || 0,
    total_tokens: Number(value.total_tokens ?? value.tokens) || 0,
    cost: Number(value.cost ?? value.cost_usd) || 0,
  };
}

function normalizeRequestItem(value: RequestLogItem): RequestLogItem {
  return {
    ...value,
    prompt_tokens: Number(value.prompt_tokens ?? value.input_tokens) || 0,
    completion_tokens: Number(value.completion_tokens ?? value.output_tokens) || 0,
    total_tokens: Number(value.total_tokens) || 0,
    cost: Number(value.cost ?? value.cost_usd) || 0,
    error: value.error ?? (value.failed ? '请求失败' : null),
  };
}

export async function getUsageOverview(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const payload = await apiJson<ApiRecord>('/user/usage/overview', { signal, query: { ...params, range: normalizeRange(params?.range) } });
  const inner = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as ApiRecord
    : payload;
  return normalizeUsageOverview((inner ?? {}) as ApiRecord);
}

export async function getUsageTrend(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  const payload = await apiJson<unknown>('/user/usage/trend', { signal, query: { ...params, range: normalizeRange(params?.range) } });
  return firstArray<UsageTrendItem>(payload, ['trend', 'items', 'data', 'buckets', 'list']).map(normalizeTrendItem);
}

export function getUsageAnalysis(params?: { from?: string; to?: string; range?: string }, signal?: AbortSignal) {
  return apiJson<ApiRecord>('/user/usage/analysis', { signal, query: { ...params, range: normalizeRange(params?.range) } });
}

export function getUsageQuotaLimit(signal?: AbortSignal) {
  return apiJson<ApiRecord>('/user/quotas', { signal });
}

// ---- Request logs ----

export type RequestLogPage = {
  items: RequestLogItem[];
  nextCursor: string;
  raw: unknown;
};

export async function getRequests(params?: { limit?: number; cursor?: string; q?: string; model?: string; status?: string }, signal?: AbortSignal): Promise<RequestLogPage> {
  const page = Math.max(1, Number(params?.cursor) || 1);
  const pageSize = params?.limit ?? 20;
  const payload = await apiJson<unknown>('/user/usage/events', {
    signal,
    query: {
      page,
      page_size: pageSize,
      model: params?.model ?? params?.q,
      failed: params?.status === 'failed' ? true : undefined,
    },
  });
  const items = firstArray<RequestLogItem>(payload, ['events', 'requests', 'items', 'data', 'list', 'logs']).map(normalizeRequestItem);
  let nextCursor = '';
  if (payload && typeof payload === 'object') {
    const record = payload as ApiRecord;
    for (const key of ['next_cursor', 'nextCursor', 'cursor']) {
      if (typeof record[key] === 'string' && record[key]) {
        nextCursor = record[key] as string;
        break;
      }
    }
    const pagination = record.pagination && typeof record.pagination === 'object'
      ? record.pagination as ApiRecord
      : record.meta && typeof record.meta === 'object' ? record.meta as ApiRecord : record;
    const totalPages = Number(pagination.total_pages ?? pagination.pages ?? pagination.page_count);
    if (!nextCursor && (Number.isFinite(totalPages) ? page < totalPages : items.length >= pageSize)) {
      nextCursor = String(page + 1);
    }
  }
  return { items, nextCursor, raw: payload };
}
