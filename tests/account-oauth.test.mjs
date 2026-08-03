import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import ts from 'typescript';

const source = await readFile(new URL('../src/lib/account-oauth.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { accountImportProviderKey, oauthPollPayload, oauthStartPayload, oauthSubmitPayload } = await import(moduleUrl);

test('maps mobile provider names to the current web account contract', () => {
  assert.equal(accountImportProviderKey('openai'), 'codex');
  assert.equal(accountImportProviderKey('moonshot'), 'kimi');
  assert.equal(accountImportProviderKey('gemini'), 'google-ai-studio');
  assert.equal(accountImportProviderKey('custom-provider'), 'custom-provider');
});

test('builds oauth flow payloads with callback_url', () => {
  assert.deepEqual(oauthStartPayload(' proxy-1 '), { proxy_id: 'proxy-1' });
  assert.deepEqual(oauthPollPayload(' session-1 '), { session_id: 'session-1' });
  assert.deepEqual(oauthSubmitPayload({ proxyId: ' proxy-1 ', sessionId: ' session-1 ', callbackUrl: ' http://localhost/callback?code=abc ' }), {
    proxy_id: 'proxy-1',
    session_id: 'session-1',
    callback_url: 'http://localhost/callback?code=abc',
  });
});
