import { apiJson, extractErrorMessage, resolveApiUrl } from '@/src/lib/api';
import type { ApiRecord, PublicConfig, UserProfile } from '@/src/types/api';

export function getPublicConfig(baseUrl?: string, signal?: AbortSignal) {
  return apiJson<PublicConfig>('/auth/public-config', { baseUrl, signal, retryAuth: false });
}

export function getSetupStatus(baseUrl?: string, signal?: AbortSignal) {
  return apiJson<{ initialized?: boolean }>('/setup/status', { baseUrl, signal, retryAuth: false });
}

export function setupAdmin(input: { email: string; password: string; name?: string }, baseUrl?: string) {
  return apiJson<ApiRecord>('/setup/admin', { method: 'POST', baseUrl, retryAuth: false, body: JSON.stringify(input) });
}

export function login(input: { email: string; password: string }, baseUrl?: string) {
  return apiJson<ApiRecord>('/auth/login', {
    method: 'POST',
    baseUrl,
    retryAuth: false,
    body: JSON.stringify({ email: input.email.trim(), password: input.password }),
  });
}

export function register(input: { email: string; password: string; name?: string; invite_code?: string; code?: string }, baseUrl?: string) {
  const body: ApiRecord = { email: input.email.trim(), password: input.password };
  if (input.name?.trim()) body.name = input.name.trim();
  if (input.invite_code?.trim()) body.invite_code = input.invite_code.trim();
  if (input.code?.trim()) body.code = input.code.trim();
  return apiJson<ApiRecord>('/auth/register', { method: 'POST', baseUrl, retryAuth: false, body: JSON.stringify(body) });
}

export function sendCode(input: { email: string; purpose?: string }, baseUrl?: string) {
  const body: ApiRecord = { email: input.email.trim() };
  if (input.purpose) body.purpose = input.purpose;
  return apiJson<ApiRecord>('/auth/send-code', { method: 'POST', baseUrl, retryAuth: false, body: JSON.stringify(body) });
}

export function resetPassword(input: { email: string; code: string; password: string }, baseUrl?: string) {
  return apiJson<ApiRecord>('/auth/reset-password', {
    method: 'POST',
    baseUrl,
    retryAuth: false,
    body: JSON.stringify({ email: input.email.trim(), code: input.code.trim(), password: input.password }),
  });
}

export function apiKeyLogin(apiKey: string, baseUrl?: string) {
  return apiJson<ApiRecord>('/auth/api-key-login', {
    method: 'POST',
    baseUrl,
    retryAuth: false,
    body: JSON.stringify({ api_key: apiKey.trim() }),
  });
}

export async function managementTokenLogin(token: string, baseUrl?: string) {
  const value = token.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(resolveApiUrl('/admin/management-tokens', baseUrl), {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${value}` },
      signal: controller.signal,
    });
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = undefined; }
    if (response.ok) return payload as ApiRecord;
    const message = extractErrorMessage(payload, `令牌验证失败（HTTP ${response.status}）`);
    // A valid least-privilege token may not have permission to list management tokens.
    if (response.status === 403 && /scope|permission|forbidden|权限/i.test(message)) return {};
    if (response.status === 401) throw new Error('管理令牌无效、已过期或已撤销');
    throw new Error(message);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('令牌验证超时，请检查服务器连接');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function logout() {
  return apiJson<ApiRecord>('/auth/logout', { method: 'POST', retryAuth: false });
}

function decodeJwtProfile(token: string): UserProfile | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const binary = atob(normalized);
    const json = decodeURIComponent(Array.from(binary, (character) =>
      `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    const claims = JSON.parse(json) as UserProfile;
    return typeof claims === 'object' && claims !== null ? claims : null;
  } catch {
    return null;
  }
}

export function extractProfile(payload: unknown): UserProfile | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as ApiRecord;
  for (const candidate of [record, record.user, record.profile, record.data]) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const item = candidate as UserProfile;
      if (typeof item.email === 'string' || typeof item.role === 'string' || item.id !== undefined) return item;
      const token = (candidate as ApiRecord).token ?? (candidate as ApiRecord).access_token;
      if (typeof token === 'string') {
        const profile = decodeJwtProfile(token);
        if (profile) return profile;
      }
    }
  }
  return null;
}
