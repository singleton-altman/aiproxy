import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import ts from 'typescript';

const source = await readFile(new URL('../src/lib/usage-trend.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { buildRecentUsageTrend, normalizeUsageTrend, usageTrendDateLabel } = await import(moduleUrl);

test('normalizes nested daily trend and derives request totals', () => {
  const items = normalizeUsageTrend({
    data: {
      trend: [
        { date: '2026-07-26', successful_requests: 480, failed_requests: 20 },
        { day: '2026-07-27', total_requests: 440, failure_count: 4 },
      ],
    },
  });

  assert.deepEqual(items.map(({ bucket_start, request_count, success_count, failed_count }) => ({
    bucket_start,
    request_count,
    success_count,
    failed_count,
  })), [
    { bucket_start: '2026-07-26', request_count: 500, success_count: 480, failed_count: 20 },
    { bucket_start: '2026-07-27', request_count: 440, success_count: 436, failed_count: 4 },
  ]);
});

test('supports series points and alternate date fields', () => {
  const items = normalizeUsageTrend({ result: { series: [{ period: '2026-07-31', requests: '35', errors: '2' }] } });

  assert.equal(items.length, 1);
  assert.equal(items[0].bucket_start, '2026-07-31');
  assert.equal(items[0].request_count, 35);
  assert.equal(items[0].success_count, 33);
  assert.equal(items[0].failed_count, 2);
});

test('supports APIs that return parallel trend arrays', () => {
  const items = normalizeUsageTrend({
    data: {
      dates: ['2026-07-30', '2026-07-31'],
      success_count: [410, 430],
      failed_count: [10, 12],
    },
  });

  assert.deepEqual(items.map(({ bucket_start, request_count }) => ({ bucket_start, request_count })), [
    { bucket_start: '2026-07-30', request_count: 420 },
    { bucket_start: '2026-07-31', request_count: 442 },
  ]);
});

test('aggregates and sorts web trend rows by bucket date', () => {
  const items = normalizeUsageTrend([
    { bucket_date: '2026-07-31', request_count: 4, failed_count: 1, total_tokens: 80, cost_usd: 0.4 },
    { bucket_date: '2026-07-29', request_count: 3, failed_count: 0, total_tokens: 40, cost_usd: 0.1 },
    { bucket_date: '2026-07-31', request_count: 6, failed_count: 2, total_tokens: 120, cost_usd: 0.6 },
  ]);

  assert.deepEqual(items.map(({ bucket_start, request_count, success_count, failed_count, total_tokens, cost }) => ({
    bucket_start,
    request_count,
    success_count,
    failed_count,
    total_tokens,
    cost,
  })), [
    { bucket_start: '2026-07-29', request_count: 3, success_count: 3, failed_count: 0, total_tokens: 40, cost: 0.1 },
    { bucket_start: '2026-07-31', request_count: 10, success_count: 7, failed_count: 3, total_tokens: 200, cost: 1 },
  ]);
});

test('fills missing local calendar days without shifting dated values', () => {
  const now = new Date(2026, 7, 1, 20, 0);
  const items = buildRecentUsageTrend(normalizeUsageTrend([
    { bucket_date: '2026-07-26', request_count: 2, failed_count: 0 },
    { bucket_date: '2026-07-29', request_count: 9, failed_count: 1 },
    { bucket_date: '2026-08-01', request_count: 5, failed_count: 2 },
  ]), 7, now);

  assert.deepEqual(items.map(({ bucket_start, request_count, failed_count }) => ({ bucket_start, request_count, failed_count })), [
    { bucket_start: '2026-07-26', request_count: 2, failed_count: 0 },
    { bucket_start: '2026-07-27', request_count: 0, failed_count: 0 },
    { bucket_start: '2026-07-28', request_count: 0, failed_count: 0 },
    { bucket_start: '2026-07-29', request_count: 9, failed_count: 1 },
    { bucket_start: '2026-07-30', request_count: 0, failed_count: 0 },
    { bucket_start: '2026-07-31', request_count: 0, failed_count: 0 },
    { bucket_start: '2026-08-01', request_count: 5, failed_count: 2 },
  ]);
});

test('formats alternate date fields for the chart axis', () => {
  assert.equal(usageTrendDateLabel({ period_start: '2026-07-26T00:00:00Z' }, 0, 7), '7/26');
  assert.equal(usageTrendDateLabel({ bucket_time: '20260731' }, 6, 7), '7/31');
});

test('fills missing dates with the latest local calendar days', () => {
  const now = new Date(2026, 6, 31, 22, 58);
  const labels = Array.from({ length: 7 }, (_, index) => usageTrendDateLabel({}, index, 7, now));
  assert.deepEqual(labels, ['7/25', '7/26', '7/27', '7/28', '7/29', '7/30', '7/31']);
});
