import { endSession, markSessionAuthenticated, sessionState } from '@/src/store/session';
import type { ApiRecord } from '@/src/types/api';

export class ApiAuthError extends Error {
  constructor(message = '登录已失效，请重新登录') {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export type ApiRequestOptions = RequestInit & {
  baseUrl?: string;
  timeoutMs?: number;
  retryAuth?: boolean;
  responseType?: 'auto' | 'json' | 'text' | 'blob';
  query?: Record<string, string | number | boolean | undefined | null>;
};

export type ApiResult = {
  status: number;
  contentType: string;
  filename?: string;
  kind: 'json' | 'text' | 'binary' | 'empty';
  data?: unknown;
  byteLength?: number;
  blob?: Blob;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
const API_PREFIX = '/api/v1';

let reloginPromise: Promise<void> | undefined;

export function buildQuery(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return '';
  const value = Object.entries(params)
    .filter((entry): entry is [string, string | number | boolean] =>
      entry[1] !== undefined && entry[1] !== null && entry[1] !== '')
    .map(([key, item]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
    .join('&');
  return value ? `?${value}` : '';
}

export function resolveApiUrl(path: string, baseUrlOverride?: string) {
  const baseUrl = (baseUrlOverride ?? sessionState.baseUrl).trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('请先填写服务地址');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  // Gateway (/v1/*) and already-prefixed paths bypass the /api/v1 prefix.
  if (normalized.startsWith('/v1/') || normalized.startsWith(`${API_PREFIX}/`)) return `${baseUrl}${normalized}`;
  return `${baseUrl}${API_PREFIX}${normalized}`;
}

function cleanErrorText(value: unknown) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || /<!doctype\s+html|<html\b|<head\b|<body\b|<title\b|<h1\b/i.test(text)) return '';
  if (/^(?:502\s+)?bad gateway$|^(?:503\s+)?service unavailable$|^(?:504\s+)?gateway timeout$/i.test(text)) return '';
  return text;
}

function httpErrorMessage(status: number) {
  if (status === 502 || status === 503 || status === 504) return `无法连接服务（HTTP ${status}），请确认服务已启动并检查网络连接`;
  if (status >= 500) return `服务器暂时不可用（HTTP ${status}），请稍后重试`;
  return `请求失败（HTTP ${status}）`;
}

export function extractErrorMessage(payload: unknown, fallback: string) {
  const text = cleanErrorText(payload);
  if (text) return text;
  if (payload && typeof payload === 'object') {
    const record = payload as ApiRecord;
    const directError = cleanErrorText(record.error);
    if (directError) return directError;
    if (record.error && typeof record.error === 'object') {
      const nested = record.error as ApiRecord;
      const nestedMessage = cleanErrorText(nested.message);
      if (nestedMessage) return nestedMessage;
    }
    const message = cleanErrorText(record.message);
    if (message) return message;
  }
  return cleanErrorText(fallback);
}

function isAuthFailure(status: number, payload: unknown) {
  if (status === 401) return true;
  if (status !== 403) return false;
  return /missing authorization|not authenticated|unauthorized|session expired/i
    .test(extractErrorMessage(payload, ''));
}

function decodeFilename(value: string | null) {
  if (!value) return undefined;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const raw = encoded ?? value.match(/filename="?([^";]+)"?/i)?.[1];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function performRelogin() {
  const { mode, email, password, apiKey } = sessionState;
  if (mode === 'management') throw new ApiAuthError('管理令牌无效或已撤销');
  const body = mode === 'apikey'
    ? { api_key: apiKey }
    : { email: email.trim(), password };
  const path = mode === 'apikey' ? '/auth/api-key-login' : '/auth/login';
  if (mode === 'apikey' ? !apiKey : (!email || !password)) throw new ApiAuthError();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(resolveApiUrl(path), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    if (!response.ok) throw new ApiAuthError(extractErrorMessage(payload, response.status >= 500 ? httpErrorMessage(response.status) : `重新登录失败（HTTP ${response.status}）`));
    markSessionAuthenticated(true);
  } catch (error) {
    if (error instanceof ApiAuthError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ApiAuthError('重新登录超时，请检查服务器连接');
    throw new ApiAuthError('重新登录失败，请检查服务器连接');
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshApiSession() {
  if (reloginPromise) return reloginPromise;
  reloginPromise = performRelogin();
  try {
    return await reloginPromise;
  } finally {
    reloginPromise = undefined;
  }
}

export async function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<ApiResult> {
  const {
    baseUrl,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    retryAuth = true,
    responseType = 'auto',
    query,
    ...requestOptions
  } = options;

  const controller = new AbortController();
  const externalSignal = requestOptions.signal;
  let timedOut = false;
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', responseType === 'blob'
      ? 'application/octet-stream, application/json;q=0.8, text/plain;q=0.6'
      : 'application/json, text/plain;q=0.8');
  }
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const isBlob = typeof Blob !== 'undefined' && options.body instanceof Blob;
  if (options.body && !isFormData && !isBlob && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const isAdminRequest = /^\/(?:api\/v1\/)?admin(?:\/|$)/i.test(path);
  if (sessionState.mode === 'management' && sessionState.managementToken && isAdminRequest && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionState.managementToken}`);
  }

  try {
    const response = await fetch(`${resolveApiUrl(path, baseUrl)}${buildQuery(query)}`, {
      ...requestOptions,
      credentials: 'include',
      headers,
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const filename = decodeFilename(response.headers.get('content-disposition'));

    let payload: unknown;
    let result: ApiResult | undefined;
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      result = { status: response.status, contentType, filename, kind: 'empty' };
    } else if (responseType === 'blob' && response.ok && !contentType.includes('application/json') && !contentType.includes('+json')) {
      const blob = await response.blob();
      return { status: response.status, contentType, filename, kind: 'binary', byteLength: blob.size, blob };
    } else if (contentType.includes('application/json') || contentType.includes('+json') || responseType === 'json') {
      const raw = await response.text();
      try {
        payload = raw.trim() ? JSON.parse(raw) as unknown : undefined;
      } catch {
        payload = raw;
      }
      result = payload === undefined
        ? { status: response.status, contentType, filename, kind: 'empty' }
        : typeof payload === 'string'
          ? { status: response.status, contentType, filename, kind: 'text', data: payload }
          : { status: response.status, contentType, filename, kind: 'json', data: payload };
    } else if (responseType === 'text' || contentType.startsWith('text/') || contentType.includes('xml') || contentType.includes('yaml') || !contentType) {
      const raw = await response.text();
      payload = (() => {
        // Some deployments omit Content-Type on JSON responses.
        try { return raw.trim() ? JSON.parse(raw) as unknown : undefined; } catch { return raw; }
      })();
      result = payload === undefined
        ? { status: response.status, contentType, filename, kind: 'empty' }
        : typeof payload === 'string'
          ? { status: response.status, contentType, filename, kind: 'text', data: payload }
          : { status: response.status, contentType, filename, kind: 'json', data: payload };
    } else {
      const blob = await response.blob();
      if (!response.ok) {
        const detail = blob.size <= 65536 ? (await blob.text()).trim() : '';
        throw new Error(extractErrorMessage(detail, httpErrorMessage(response.status)));
      }
      return { status: response.status, contentType, filename, kind: 'binary', byteLength: blob.size, blob };
    }

    if (isAuthFailure(response.status, payload)) {
      if (sessionState.mode === 'management') {
        if (isAdminRequest) {
          await endSession();
          throw new ApiAuthError('管理令牌无效、已过期或已撤销');
        }
        throw new ApiAuthError('管理令牌仅能访问管理接口');
      }
      if (retryAuth && sessionState.mode) {
        try {
          await refreshApiSession();
          return await apiFetch(path, { ...options, retryAuth: false });
        } catch (refreshError) {
          await endSession();
          if (refreshError instanceof ApiAuthError) throw refreshError;
        }
      }
      throw new ApiAuthError(extractErrorMessage(payload, '登录已失效，请重新登录'));
    }
    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, httpErrorMessage(response.status)));
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (externalSignal?.aborted) throw new Error('请求已取消');
      if (timedOut) throw new Error('请求超时，请检查服务器连接');
    }
    if (error instanceof Error && /network request failed|failed to fetch|load failed|networkerror|internet connection appears to be offline/i.test(error.message)) {
      throw new Error('无法连接服务器，请检查服务地址和网络连接');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

export async function apiJson<T = ApiRecord>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const result = await apiFetch(path, options);
  if (result.kind === 'empty') return undefined as T;
  if (result.kind === 'json') return result.data as T;
  if (result.kind === 'text') return result.data as T;
  throw new Error('服务器返回了无法识别的数据');
}

export function firstArray<T = ApiRecord>(payload: unknown, keys: string[] = ['items', 'data', 'list', 'results', 'rows']): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const record = payload as ApiRecord;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}
