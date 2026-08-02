import type { ApiRecord } from '@/src/types/api';

type PreviewVariables = {
  siteName?: string;
  email?: string;
  code?: string;
  expiresMinutes?: string | number;
  resetUrl?: string;
};

const nestedKeys = ['data', 'result', 'payload', 'preview', 'template'];

function record(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {};
}

function nestedString(value: unknown, keys: string[], depth = 0): string {
  if (typeof value === 'string') return value;
  if (depth > 4) return '';
  const source = record(value);
  for (const key of keys) {
    if (typeof source[key] === 'string') return String(source[key]);
  }
  for (const key of nestedKeys) {
    const found = nestedString(source[key], keys, depth + 1);
    if (found) return found;
  }
  return '';
}

export function renderEmailTemplateSample(value: string, variables: PreviewVariables = {}) {
  const replacements: Record<string, string> = {
    SiteName: variables.siteName?.trim() || 'AI Proxy',
    Email: variables.email?.trim() || 'user@example.com',
    Code: variables.code?.trim() || '123456',
    ExpiresMinutes: String(variables.expiresMinutes ?? 10),
    ResetURL: variables.resetUrl?.trim() || 'https://example.com/reset',
    ResetUrl: variables.resetUrl?.trim() || 'https://example.com/reset',
  };
  return value.replace(/\{\{\s*\.?([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (source, key: string) => replacements[key] ?? source);
}

export function normalizeEmailPreview(value: unknown, template: ApiRecord, variables: PreviewVariables = {}) {
  const subject = nestedString(value, ['subject', 'rendered_subject', 'renderedSubject']) || String(template.subject ?? '');
  const html = nestedString(value, ['html', 'rendered_html', 'renderedHtml', 'body', 'content']) || String(template.body ?? '');
  return {
    subject: renderEmailTemplateSample(subject, variables),
    html: renderEmailTemplateSample(html, variables),
  };
}

export function emailPreviewDocument(html: string) {
  const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">';
  if (/<html[\s>]/i.test(html)) {
    return /<head[\s>]/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${viewport}`) : html.replace(/<html([^>]*)>/i, `<html$1><head>${viewport}</head>`);
  }
  return `<!doctype html><html><head>${viewport}<style>html,body{margin:0;padding:0;min-height:100%;background:#eef1f6}*{box-sizing:border-box}</style></head><body>${html}</body></html>`;
}
