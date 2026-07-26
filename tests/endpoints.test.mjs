import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = resolve(import.meta.dirname, '..', 'docs', 'AIProxy_API_Endpoints.json');
const endpoints = JSON.parse(await readFile(sourcePath, 'utf8'));

test('endpoint source is a non-empty array', () => {
  assert.ok(Array.isArray(endpoints), 'source must be an array');
  assert.ok(endpoints.length > 0, 'source must not be empty');
});

test('every endpoint path starts with "/"', () => {
  for (const item of endpoints) {
    assert.match(String(item.path), /^\//, `Invalid path: ${item.path}`);
  }
});

test('no duplicate method + path combinations', () => {
  const seen = new Set();
  for (const item of endpoints) {
    for (const method of String(item.methods).split('/').filter(Boolean)) {
      const key = `${method} ${item.path}`;
      assert.ok(!seen.has(key), `Duplicate endpoint: ${key}`);
      seen.add(key);
    }
  }
});
