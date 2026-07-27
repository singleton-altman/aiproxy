import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { UserProfile } from '@/src/types/api';

const { proxy } = require('valtio');

const SESSION_KEY = 'ai_proxy_app_session';

export type SessionMode = '' | 'session' | 'apikey' | 'management';

type PersistedSession = {
  baseUrl: string;
  mode: SessionMode;
  email: string;
  password: string;
  apiKey: string;
  managementToken: string;
  profile?: UserProfile | null;
};

type SessionState = PersistedSession & {
  authenticated: boolean;
  profile: UserProfile | null;
  hydrated: boolean;
};

export const sessionState: SessionState = proxy({
  baseUrl: '',
  mode: '' as SessionMode,
  email: '',
  password: '',
  apiKey: '',
  managementToken: '',
  authenticated: false,
  profile: null,
  hydrated: false,
});

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}

async function readSession() {
  try {
    if (Platform.OS === 'web') {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(SESSION_KEY);
    }
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
}

async function writeSession(value: string | null) {
  try {
    if (Platform.OS === 'web') {
      if (typeof sessionStorage !== 'undefined') {
        value === null ? sessionStorage.removeItem(SESSION_KEY) : sessionStorage.setItem(SESSION_KEY, value);
      }
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(SESSION_KEY);
    else await SecureStore.setItemAsync(SESSION_KEY, value);
  } catch {
    // The in-memory session remains usable when secure persistence is unavailable.
  }
}

async function persist() {
  await writeSession(JSON.stringify({
    baseUrl: sessionState.baseUrl,
    mode: sessionState.mode,
    email: sessionState.email,
    password: sessionState.password,
    apiKey: sessionState.apiKey,
    managementToken: sessionState.managementToken,
    profile: sessionState.profile,
  } satisfies PersistedSession));
}

export async function hydrateSession() {
  try {
    const raw = await readSession();
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PersistedSession>;
      sessionState.baseUrl = normalizeBaseUrl(saved.baseUrl ?? '');
      sessionState.mode = saved.mode === 'session' || saved.mode === 'apikey' || saved.mode === 'management' ? saved.mode : '';
      sessionState.email = saved.email ?? '';
      sessionState.password = saved.password ?? '';
      sessionState.apiKey = saved.apiKey ?? '';
      sessionState.managementToken = saved.managementToken ?? '';
      sessionState.profile = saved.profile && typeof saved.profile === 'object' ? saved.profile : null;
      const hasCredentials = sessionState.mode === 'session'
        ? Boolean(sessionState.email && sessionState.password)
        : sessionState.mode === 'apikey'
          ? Boolean(sessionState.apiKey)
          : sessionState.mode === 'management' ? Boolean(sessionState.managementToken) : false;
      sessionState.authenticated = Boolean(sessionState.baseUrl && hasCredentials);
    }
  } catch {
    await writeSession(null);
  } finally {
    sessionState.hydrated = true;
  }
}

export async function saveSession(session: PersistedSession, profile: UserProfile | null = null) {
  sessionState.baseUrl = normalizeBaseUrl(session.baseUrl);
  sessionState.mode = session.mode;
  sessionState.email = session.email;
  sessionState.password = session.password;
  sessionState.apiKey = session.apiKey;
  sessionState.managementToken = session.managementToken;
  sessionState.profile = profile;
  sessionState.authenticated = true;
  await persist();
}

export function setSessionProfile(profile: UserProfile | null) {
  sessionState.profile = profile;
  void persist();
}

export function markSessionAuthenticated(value: boolean) {
  sessionState.authenticated = value;
}

export async function saveGatewayApiKey(apiKey: string) {
  sessionState.apiKey = apiKey.trim();
  await persist();
}

export async function endSession() {
  sessionState.authenticated = false;
  sessionState.profile = null;
  sessionState.mode = '';
  sessionState.password = '';
  sessionState.apiKey = '';
  sessionState.managementToken = '';
  await persist();
}

export function isAdmin() {
  if (sessionState.mode === 'management') return true;
  const role = sessionState.profile?.role;
  return role === 'admin' || role === 'super_admin';
}
