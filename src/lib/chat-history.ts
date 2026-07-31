import { File as ExpoFile, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { ApiRecord, ChatMessage } from '@/src/types/api';

const CHAT_HISTORY_KEY = 'ai-proxy-chat-history-v1';
const CHAT_HISTORY_FILE = 'ai-proxy-chat-history.json';
const MAX_SCOPES = 6;
const MAX_ENTRIES = 100;
const MAX_ENTRY_CHARS = 50_000;
const MAX_TOTAL_CHARS = 500_000;

export type PersistedChatEntry = ChatMessage & {
  id: number;
  error?: string;
  pending?: boolean;
  usage?: ApiRecord;
};

export type ChatHistorySnapshot = {
  entries: PersistedChatEntry[];
  model: string;
  protocol: 'auto' | 'openai' | 'anthropic';
  systemPrompt: string;
  temperature: number;
  maxTokens: string;
  streamEnabled: boolean;
};

type StoredHistory = ChatHistorySnapshot & { updatedAt: number };
type HistoryStore = { version: 1; histories: Record<string, StoredHistory> };

let writeQueue = Promise.resolve();

function emptyStore(): HistoryStore {
  return { version: 1, histories: {} };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function chatHistoryScope({ baseUrl, mode, email, apiKey }: { baseUrl: string; mode: string; email: string; apiKey: string }) {
  const principal = email.trim().toLowerCase() || (mode === 'apikey' ? `key:${stableHash(apiKey)}` : 'anonymous');
  const identity = `${mode || 'unknown'}:${principal}`;
  return `${stableHash(baseUrl.trim().toLowerCase())}:${stableHash(identity)}`;
}

function safeUsage(value: unknown): ApiRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as ApiRecord;
  const usage: ApiRecord = {};
  for (const key of ['prompt_tokens', 'input_tokens', 'completion_tokens', 'output_tokens', 'total_tokens', 'cost']) {
    const item = source[key];
    if (typeof item === 'number' && Number.isFinite(item)) usage[key] = item;
  }
  return Object.keys(usage).length ? usage : undefined;
}

function normalizeEntries(value: unknown): PersistedChatEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: PersistedChatEntry[] = [];
  let remaining = MAX_TOTAL_CHARS;
  for (let index = value.length - 1; index >= 0 && entries.length < MAX_ENTRIES && remaining > 0; index -= 1) {
    const item = value[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const role = source.role === 'user' || source.role === 'assistant' ? source.role : undefined;
    if (!role) continue;
    const pending = source.pending === true;
    const rawContent = typeof source.content === 'string' ? source.content : '';
    if (pending && !rawContent) continue;
    const content = rawContent.slice(0, Math.min(MAX_ENTRY_CHARS, remaining));
    const error = typeof source.error === 'string' ? source.error.slice(0, 1_000) : undefined;
    if (!content && !error) continue;
    const usage = safeUsage(source.usage);
    remaining -= content.length;
    entries.push({
      id: Number.isSafeInteger(source.id) && Number(source.id) > 0 ? Number(source.id) : index + 1,
      role,
      content,
      ...(error ? { error } : {}),
      ...(usage ? { usage } : {}),
    });
  }
  return entries.reverse();
}

function normalizeSnapshot(value: unknown): ChatHistorySnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const protocol = source.protocol === 'openai' || source.protocol === 'anthropic' ? source.protocol : 'auto';
  const temperature = typeof source.temperature === 'number' && Number.isFinite(source.temperature)
    ? Math.max(0, Math.min(2, source.temperature))
    : 0.7;
  return {
    entries: normalizeEntries(source.entries),
    model: typeof source.model === 'string' ? source.model.slice(0, 300) : '',
    protocol,
    systemPrompt: typeof source.systemPrompt === 'string' ? source.systemPrompt.slice(0, 20_000) : '',
    temperature,
    maxTokens: typeof source.maxTokens === 'string' ? source.maxTokens.slice(0, 12) : '2048',
    streamEnabled: source.streamEnabled !== false,
  };
}

async function readRaw() {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(CHAT_HISTORY_KEY);
  }
  const file = new ExpoFile(Paths.document, CHAT_HISTORY_FILE);
  return file.exists ? await file.text() : null;
}

async function writeRaw(value: string) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CHAT_HISTORY_KEY, value);
    return;
  }
  new ExpoFile(Paths.document, CHAT_HISTORY_FILE).write(value);
}

async function readStore(): Promise<HistoryStore> {
  try {
    const raw = await readRaw();
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<HistoryStore>;
    return parsed.version === 1 && parsed.histories && typeof parsed.histories === 'object'
      ? { version: 1, histories: parsed.histories }
      : emptyStore();
  } catch {
    return emptyStore();
  }
}

export async function loadChatHistory(scope: string) {
  await writeQueue;
  const store = await readStore();
  return normalizeSnapshot(store.histories[scope]);
}

export function saveChatHistory(scope: string, snapshot: ChatHistorySnapshot) {
  const normalized = normalizeSnapshot(snapshot);
  if (!scope || !normalized) return Promise.resolve();
  writeQueue = writeQueue.then(async () => {
    try {
      const store = await readStore();
      store.histories[scope] = { ...normalized, updatedAt: Date.now() };
      const retained = Object.entries(store.histories)
        .sort((left, right) => Number(right[1]?.updatedAt ?? 0) - Number(left[1]?.updatedAt ?? 0))
        .slice(0, MAX_SCOPES);
      store.histories = Object.fromEntries(retained);
      await writeRaw(JSON.stringify(store));
    } catch {
      // Chat remains usable when local persistence is unavailable.
    }
  });
  return writeQueue;
}
