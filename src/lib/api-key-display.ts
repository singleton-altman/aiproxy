import type { ApiRecord } from '@/src/types/api';

function displayName(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value).trim();
  if (!text
    || /^\d+$/.test(text)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    || /^(?:sk|aps|key)[-_][a-z0-9_-]{12,}$/i.test(text)) return '';
  return text;
}

function lookupText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim().toLowerCase() : '';
}

function lookupPrefix(value: unknown) {
  return lookupText(value).replace(/[.*\u2022\u2026]/g, '');
}

function maskedPrefix(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value).trim();
  if (!text) return '';
  if (text.includes('*') || text.includes('...')) return text.length > 22 ? `${text.slice(0, 19)}...` : text;
  return `${text.slice(0, 10)}...`;
}

export function apiKeyDisplayName(item: ApiRecord) {
  const name = [item.api_key_name, item.key_name, item.display_name, item.name, item.label].map(displayName).find(Boolean);
  if (name) return name;
  return [item.prefix, item.key_prefix, item.preview].map(maskedPrefix).find(Boolean) || '未命名 Key';
}

export function enrichApiKeyUsage(items: ApiRecord[], keys: ApiRecord[]) {
  const keysById = new Map<string, ApiRecord>();
  for (const key of keys) {
    for (const id of [key.id, key.api_key_id, key.key_id, key.uuid]) {
      const value = lookupText(id);
      if (value) keysById.set(value, key);
    }
  }

  return items.map((item) => {
    if ([item.api_key_name, item.key_name, item.display_name, item.name, item.label].some((value) => displayName(value))) return item;
    const ids = [item.api_key_id, item.key_id, item.apiKeyId, item.id, item.name].map(lookupText).filter(Boolean);
    let key = ids.map((id) => keysById.get(id)).find(Boolean);
    if (!key) {
      const rowPrefix = [item.prefix, item.key_prefix, item.preview, item.api_key].map(lookupPrefix).find(Boolean);
      if (rowPrefix) key = keys.find((candidate) => [candidate.prefix, candidate.key_prefix, candidate.preview]
        .map(lookupPrefix)
        .some((prefix) => prefix && (prefix === rowPrefix || prefix.startsWith(rowPrefix) || rowPrefix.startsWith(prefix))));
    }
    if (!key) return item;
    return {
      ...item,
      api_key_name: key.name ?? key.display_name ?? key.label,
      prefix: item.prefix ?? item.key_prefix ?? key.prefix ?? key.key_prefix,
    };
  });
}
