import { apiJson } from '@/src/lib/api';
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

export function logout() {
  return apiJson<ApiRecord>('/auth/logout', { method: 'POST', retryAuth: false });
}

export function extractProfile(payload: unknown): UserProfile | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as ApiRecord;
  for (const candidate of [record, record.user, record.profile, record.data]) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const item = candidate as UserProfile;
      if (typeof item.email === 'string' || typeof item.role === 'string' || item.id !== undefined) return item;
    }
  }
  return null;
}
