import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = resolve(import.meta.dirname, '..', 'docs', 'AIProxy_API_Endpoints.json');
const endpoints = JSON.parse(await readFile(sourcePath, 'utf8'));

function methodsFor(path) {
  return endpoints
    .filter((item) => item.path === path)
    .flatMap((item) => String(item.methods).split('/').filter(Boolean))
    .sort();
}

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

test('admin mutation methods match the current server contract', () => {
  const expected = new Map([
    ['/admin/users/${id}', ['DELETE', 'PUT']],
    ['/admin/invites/${id}', ['DELETE', 'PUT']],
    ['/admin/plans/${id}', ['DELETE', 'PUT']],
    ['/admin/accounts/${id}', ['DELETE', 'PUT']],
    ['/admin/accounts/bulk', ['PUT']],
    ['/admin/accounts/export', ['POST']],
    ['/admin/accounts/${id}/models/test', ['POST']],
    ['/admin/providers/${id}', ['DELETE', 'PUT']],
    ['/admin/proxies/${id}', ['DELETE', 'PUT']],
    ['/admin/models', ['DELETE', 'GET', 'PUT']],
    ['/admin/accounts/oauth/${provider}/poll', ['POST']],
  ]);

  for (const [path, methods] of expected) {
    assert.deepEqual(methodsFor(path), methods, `Unexpected methods for ${path}`);
  }
});

test('removed endpoints are not exposed by the API debugger', () => {
  const removed = [
    '/admin/accounts/health',
    '/admin/accounts/${id}/quota/reset',
    '/admin/models/${id}',
    '/admin/snapshot',
    '/admin/stats',
    '/admin/stats/models',
    '/admin/stats/users',
    '/admin/logs/requests',
  ];

  for (const path of removed) {
    assert.deepEqual(methodsFor(path), [], `Removed endpoint is still registered: ${path}`);
  }
});
