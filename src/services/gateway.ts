import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import { extractErrorMessage, resolveApiUrl } from '@/src/lib/api';
import type { ApiRecord, ChatMessage, ModelItem } from '@/src/types/api';

export type GatewayProtocol = 'openai' | 'anthropic';

function gatewayHeaders(apiKey: string) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey.trim()}`,
  };
}

async function gatewayJson<T = ApiRecord>(path: string, apiKey: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: { ...gatewayHeaders(apiKey), ...(init.headers as Record<string, string> | undefined) },
  });
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = raw.trim() ? JSON.parse(raw) as unknown : undefined;
  } catch {
    payload = raw;
  }
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `请求失败（HTTP ${response.status}）`));
  }
  return payload as T;
}

export async function getGatewayModels(apiKey: string, signal?: AbortSignal) {
  const payload = await gatewayJson<{ data?: ModelItem[] }>('/v1/models', apiKey, { signal });
  return Array.isArray(payload?.data) ? payload.data : [];
}

export function countTokens(apiKey: string, body: ApiRecord, signal?: AbortSignal) {
  return gatewayJson<{ input_tokens?: number }>('/v1/messages/count_tokens', apiKey, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}

export function generateImages(apiKey: string, body: ApiRecord, signal?: AbortSignal) {
  return gatewayJson<ApiRecord>('/v1/images/generations', apiKey, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}

export function callResponsesApi(apiKey: string, body: ApiRecord, signal?: AbortSignal) {
  return gatewayJson<ApiRecord>('/v1/responses', apiKey, {
    method: 'POST',
    body: JSON.stringify({ ...body, stream: false }),
    signal,
  });
}

function chatRequestBody(protocol: GatewayProtocol, model: string, messages: ChatMessage[], stream: boolean): ApiRecord {
  if (protocol === 'anthropic') {
    const system = messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n\n');
    const turns = messages
      .filter((item) => item.role !== 'system')
      .map((item) => ({ role: item.role, content: item.content }));
    const body: ApiRecord = { model, messages: turns, max_tokens: 2048, stream };
    if (system.trim()) body.system = system;
    return body;
  }
  return { model, messages: messages.map((item) => ({ role: item.role, content: item.content })), stream };
}

function extractOpenAiText(payload: ApiRecord) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const message = (first as ApiRecord).message;
  if (message && typeof message === 'object' && typeof (message as ApiRecord).content === 'string') {
    return (message as ApiRecord).content as string;
  }
  return '';
}

function extractAnthropicText(payload: ApiRecord) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .map((block) => (block && typeof block === 'object' && (block as ApiRecord).type === 'text'
      ? String((block as ApiRecord).text ?? '')
      : ''))
    .join('');
}

function extractStreamDelta(protocol: GatewayProtocol, payload: ApiRecord) {
  if (protocol === 'anthropic') {
    if (payload.type === 'content_block_delta') {
      const delta = payload.delta;
      if (delta && typeof delta === 'object' && typeof (delta as ApiRecord).text === 'string') {
        return (delta as ApiRecord).text as string;
      }
    }
    if (payload.type === 'error') {
      throw new Error(extractErrorMessage(payload, '流式响应返回了错误'));
    }
    return '';
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const delta = (first as ApiRecord).delta;
  if (delta && typeof delta === 'object' && typeof (delta as ApiRecord).content === 'string') {
    return (delta as ApiRecord).content as string;
  }
  return '';
}

export type ChatStreamHandlers = {
  onDelta: (text: string) => void;
  signal?: AbortSignal;
};

export type ChatResult = {
  text: string;
  usage?: ApiRecord;
};

// Streams a chat request over SSE and falls back to a plain JSON exchange
// when the runtime cannot expose a readable response body.
export async function runChat(
  apiKey: string,
  protocol: GatewayProtocol,
  model: string,
  messages: ChatMessage[],
  handlers: ChatStreamHandlers,
): Promise<ChatResult> {
  const path = protocol === 'anthropic' ? '/v1/messages' : '/v1/chat/completions';
  const url = resolveApiUrl(path);
  const fetcher = Platform.OS === 'web' ? fetch : (expoFetch as unknown as typeof fetch);
  const response = await fetcher(url, {
    method: 'POST',
    headers: { ...gatewayHeaders(apiKey), Accept: 'text/event-stream' },
    body: JSON.stringify(chatRequestBody(protocol, model, messages, true)),
    signal: handlers.signal,
  });

  if (!response.ok) {
    const raw = await response.text();
    let payload: unknown;
    try { payload = JSON.parse(raw) as unknown; } catch { payload = raw; }
    throw new Error(extractErrorMessage(payload, `请求失败（HTTP ${response.status}）`));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    const payload = await response.json() as ApiRecord;
    const text = protocol === 'anthropic' ? extractAnthropicText(payload) : extractOpenAiText(payload);
    handlers.onDelta(text);
    return { text, usage: payload.usage && typeof payload.usage === 'object' ? payload.usage as ApiRecord : undefined };
  }

  const body = response.body;
  if (!body) {
    throw new Error('当前环境不支持流式响应');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage: ApiRecord | undefined;

  const handleEvent = (data: string) => {
    const trimmed = data.trim();
    if (!trimmed || trimmed === '[DONE]') return;
    let payload: ApiRecord;
    try {
      payload = JSON.parse(trimmed) as ApiRecord;
    } catch {
      return;
    }
    const delta = extractStreamDelta(protocol, payload);
    if (delta) {
      text += delta;
      handlers.onDelta(delta);
    }
    if (payload.usage && typeof payload.usage === 'object') usage = payload.usage as ApiRecord;
    if (payload.type === 'message_delta' && payload.usage && typeof payload.usage === 'object') {
      usage = payload.usage as ApiRecord;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const eventBlock = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = eventBlock
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        handleEvent(data);
        boundary = buffer.indexOf('\n\n');
      }
    }
    buffer += decoder.decode();
    for (const line of buffer.split('\n')) {
      if (line.startsWith('data:')) handleEvent(line.slice(5).trimStart());
    }
  } finally {
    reader.releaseLock();
  }
  return { text, usage };
}
