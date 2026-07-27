import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import { extractErrorMessage, resolveApiUrl } from '@/src/lib/api';
import type { ApiRecord, ChatMessage, ModelItem } from '@/src/types/api';

export type GatewayProtocol = 'openai' | 'anthropic';

function gatewayHeaders(apiKey: string, protocol?: GatewayProtocol) {
  const key = apiKey.trim();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'x-api-key': key,
    ...(protocol === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {}),
  };
}

function gatewayErrorMessage(payload: unknown, status: number) {
  const fallback = `请求失败（HTTP ${status}）`;
  const message = extractErrorMessage(payload, fallback).trim();
  const normalized = message.toLowerCase().replace(/_/g, ' ');
  if (/missing api key/.test(normalized)) return '未发送网关 API Key，请重新粘贴后再试';
  if (/invalid api key|unauthorized api key/.test(normalized)) {
    return '网关 Key 无效，或该模型的上游账号凭据已失效，请检查密钥和账号状态';
  }
  if (/model not allowed.*api key|api key.*not allowed.*model/.test(normalized)) {
    return '当前 API Key 未授权使用所选模型，请选择该 Key 可用的模型或调整 Key 权限';
  }
  if (/upstream request failed|upstream error/.test(normalized)) {
    return '上游账号请求失败，请检查该模型对应账号的状态、额度和网络';
  }
  if (/no (available|healthy) (account|provider)|no account available/.test(normalized)) {
    return '当前模型没有可用的上游账号，请检查账号池状态';
  }
  if (status === 429 || /rate limit|quota exceeded/.test(normalized)) {
    return '请求过于频繁或额度不足，请稍后重试并检查账号额度';
  }
  return message || fallback;
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
    throw new Error(gatewayErrorMessage(payload, response.status));
  }
  return payload as T;
}

export async function getGatewayModels(apiKey: string, signal?: AbortSignal) {
  const payload = await gatewayJson<unknown>('/v1/models', apiKey, { signal });
  if (Array.isArray(payload)) return payload.filter((item): item is ModelItem => Boolean(item) && typeof item === 'object');
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as ApiRecord;
  for (const key of ['data', 'models', 'items', 'list']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).filter((item): item is ModelItem => Boolean(item) && typeof item === 'object');
  }
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    const data = record.data as ApiRecord;
    for (const key of ['models', 'items', 'list']) {
      if (Array.isArray(data[key])) return (data[key] as unknown[]).filter((item): item is ModelItem => Boolean(item) && typeof item === 'object');
    }
  }
  return [];
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

type ChatRequestOptions = {
  stream: boolean;
  temperature?: number;
  maxTokens?: number;
};

function chatRequestBody(protocol: GatewayProtocol, model: string, messages: ChatMessage[], options: ChatRequestOptions): ApiRecord {
  if (protocol === 'anthropic') {
    const system = messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n\n');
    const turns = messages
      .filter((item) => item.role !== 'system')
      .map((item) => ({ role: item.role, content: item.content }));
    const body: ApiRecord = { model, messages: turns, max_tokens: options.maxTokens ?? 2048, stream: options.stream };
    if (system.trim()) body.system = system;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    return body;
  }
  const body: ApiRecord = { model, messages: messages.map((item) => ({ role: item.role, content: item.content })), stream: options.stream };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  return body;
}

function extractTextValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    const record = part as ApiRecord;
    if (typeof record.text === 'string') return record.text;
    if (typeof record.content === 'string') return record.content;
    return '';
  }).join('');
}

function extractOpenAiText(payload: ApiRecord) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const message = (first as ApiRecord).message;
  if (message && typeof message === 'object') {
    return extractTextValue((message as ApiRecord).content);
  }
  return extractTextValue((first as ApiRecord).text);
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
  if (payload.error) throw new Error(extractErrorMessage(payload, '流式响应返回了错误'));
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
  if (delta && typeof delta === 'object') return extractTextValue((delta as ApiRecord).content);
  return '';
}

export type ChatStreamHandlers = {
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
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
  const wantsStream = handlers.stream !== false;
  const request = (stream: boolean) => {
    const fetcher = Platform.OS === 'web' || !stream ? fetch : (expoFetch as unknown as typeof fetch);
    return fetcher(url, {
      method: 'POST',
      headers: { ...gatewayHeaders(apiKey, protocol), Accept: stream ? 'text/event-stream' : 'application/json' },
      body: JSON.stringify(chatRequestBody(protocol, model, messages, {
        stream,
        temperature: handlers.temperature,
        maxTokens: handlers.maxTokens,
      })),
      signal: handlers.signal,
    });
  };
  let response = await request(wantsStream);

  // Some upstreams reject streaming before producing an SSE body. A plain
  // JSON retry also avoids native streaming transport differences on iOS.
  if (!response.ok && wantsStream && response.status >= 500) {
    response = await request(false);
  }

  if (!response.ok) {
    const raw = await response.text();
    let payload: unknown;
    try { payload = JSON.parse(raw) as unknown; } catch { payload = raw; }
    throw new Error(gatewayErrorMessage(payload, response.status));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!wantsStream || !contentType.includes('text/event-stream')) {
    const payload = await response.json() as ApiRecord;
    const text = protocol === 'anthropic' ? extractAnthropicText(payload) : extractOpenAiText(payload);
    handlers.onDelta(text);
    return { text, usage: payload.usage && typeof payload.usage === 'object' ? payload.usage as ApiRecord : undefined };
  }

  let body = response.body;
  if (!body) {
    response = await request(false);
    if (!response.ok) {
      const raw = await response.text();
      let payload: unknown;
      try { payload = JSON.parse(raw) as unknown; } catch { payload = raw; }
      throw new Error(gatewayErrorMessage(payload, response.status));
    }
    const payload = await response.json() as ApiRecord;
    const text = protocol === 'anthropic' ? extractAnthropicText(payload) : extractOpenAiText(payload);
    handlers.onDelta(text);
    return { text, usage: payload.usage && typeof payload.usage === 'object' ? payload.usage as ApiRecord : undefined };
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
      buffer = buffer.replace(/\r\n/g, '\n');
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
