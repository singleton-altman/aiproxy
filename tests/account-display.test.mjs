import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import ts from 'typescript';

const source = await readFile(new URL('../src/lib/account-display.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { enrichAccountUsage, usageAccountName } = await import(moduleUrl);

test('uses account labels and emails returned by stats', () => {
  assert.equal(usageAccountName({ account_label: 'dot-manual' }), 'dot-manual');
  assert.equal(usageAccountName({ account_email: 'user@example.com' }), 'user@example.com');
});

test('does not expose internal account IDs as names', () => {
  assert.equal(usageAccountName({ account: 'ce6c7809-8609-4fa2-a71e-6b90a849073c' }), '');
});

test('maps alternate statistics IDs to the account directory', () => {
  const id = 'ce6c7809-8609-4fa2-a71e-6b90a849073c';
  const items = enrichAccountUsage([
    { account: id, request_count: 321 },
    { upstream_account_id: 'account-3', request_count: 3 },
  ], [
    { id, label: '主账号' },
    { id: 'account-3', email: 'backup@example.com' },
  ]);

  assert.equal(usageAccountName(items[0]), '主账号');
  assert.equal(usageAccountName(items[1]), 'backup@example.com');
});
