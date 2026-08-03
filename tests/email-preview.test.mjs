import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import ts from 'typescript';

const source = await readFile(new URL('../src/lib/email-preview.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { emailPreviewDocument, normalizeEmailPreview, renderEmailTemplateSample } = await import(moduleUrl);

test('renders common Go email template variables for local preview fallback', () => {
  assert.equal(
    renderEmailTemplateSample('{{.SiteName}} / {{ .Email }} / {{.Code}}', { siteName: 'AI Proxy', email: 'user@example.com', code: '654321' }),
    'AI Proxy / user@example.com / 654321',
  );
});

test('normalizes nested preview responses and falls back to the current template', () => {
  assert.deepEqual(
    normalizeEmailPreview({ data: { subject: '{{.SiteName}} code', html: '<b>{{.Code}}</b>' } }, {}, { siteName: 'AI Proxy', code: '123456' }),
    { subject: 'AI Proxy code', html: '<b>123456</b>' },
  );
  assert.deepEqual(
    normalizeEmailPreview({}, { subject: 'Reset', body: '<p>{{.Email}}</p>' }, { email: 'member@example.com' }),
    { subject: 'Reset', html: '<p>member@example.com</p>' },
  );
});

test('wraps fragment previews in a mobile viewport document', () => {
  const document = emailPreviewDocument('<div>Preview</div>');
  assert.match(document, /name="viewport"/);
  assert.match(document, /<div>Preview<\/div>/);
});
