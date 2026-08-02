import type { ApiRecord } from '@/src/types/api';

const providerAliases: Record<string, string> = {
  openai: 'codex',
  moonshot: 'kimi',
  gemini: 'google-ai-studio',
  qwen: 'qianwen',
  doubao: 'ark',
  zhipu: 'glm',
};

export function accountImportProviderKey(provider: string) {
  const normalized = provider.trim().toLowerCase();
  return providerAliases[normalized] ?? normalized;
}

export function oauthStartPayload(proxyId: string): ApiRecord {
  const value = proxyId.trim();
  return value ? { proxy_id: value } : {};
}

export function oauthPollPayload(sessionId: string): ApiRecord {
  const value = sessionId.trim();
  return value ? { session_id: value } : {};
}

export function oauthSubmitPayload({ proxyId, sessionId, callbackUrl }: { proxyId: string; sessionId: string; callbackUrl: string }): ApiRecord {
  const payload: ApiRecord = {};
  if (proxyId.trim()) payload.proxy_id = proxyId.trim();
  if (sessionId.trim()) payload.session_id = sessionId.trim();
  if (callbackUrl.trim()) payload.callback_url = callbackUrl.trim();
  return payload;
}
