import * as SecureStore from 'expo-secure-store';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

const PRIVACY_KEY = 'ai-proxy-privacy';

type PrivacyState = {
  enabled: boolean;
  hydrated: boolean;
};

let state: PrivacyState = { enabled: false, hydrated: false };
let hydratePromise: Promise<void> | undefined;
let revision = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

async function readPrivacyMode() {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' && localStorage.getItem(PRIVACY_KEY) === '1';
    }
    return await SecureStore.getItemAsync(PRIVACY_KEY) === '1';
  } catch {
    return false;
  }
}

async function writePrivacyMode(enabled: boolean) {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        enabled ? localStorage.setItem(PRIVACY_KEY, '1') : localStorage.removeItem(PRIVACY_KEY);
      }
      return;
    }
    if (enabled) await SecureStore.setItemAsync(PRIVACY_KEY, '1');
    else await SecureStore.deleteItemAsync(PRIVACY_KEY);
  } catch {
    // The current privacy mode remains active when persistence is unavailable.
  }
}

async function hydratePrivacyMode() {
  if (state.hydrated) return;
  if (!hydratePromise) {
    const startedAtRevision = revision;
    hydratePromise = readPrivacyMode().then((enabled) => {
      state = startedAtRevision === revision
        ? { enabled, hydrated: true }
        : { ...state, hydrated: true };
      emit();
    }).finally(() => {
      hydratePromise = undefined;
    });
  }
  await hydratePromise;
}

export function setPrivacyMode(enabled: boolean) {
  revision += 1;
  state = { enabled, hydrated: true };
  emit();
  void writePrivacyMode(enabled);
}

export function usePrivacyMode() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
  useEffect(() => { void hydratePrivacyMode(); }, []);
  return snapshot;
}
