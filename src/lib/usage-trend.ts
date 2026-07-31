import type { ApiRecord, UsageTrendItem } from '@/src/types/api';

const itemArrayKeys = ['trend', 'series', 'points', 'buckets', 'items', 'rows', 'list', 'data'];
const dateKeys = ['bucket_start', 'bucket', 'date', 'day', 'period', 'label', 'time', 'timestamp'];
const requestKeys = ['request_count', 'total_requests', 'requests', 'count', 'total'];
const successKeys = ['success_count', 'successful_count', 'successful_requests', 'success_requests', 'succeeded', 'success'];
const failedKeys = ['failed_count', 'failure_count', 'failed_requests', 'failure_requests', 'error_count', 'errors', 'failed', 'failure'];

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstValue(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  }
  return undefined;
}

function firstNumber(record: ApiRecord, keys: string[]) {
  const value = firstValue(record, keys);
  if (value === undefined) return undefined;
  const number = typeof value === 'string' ? Number(value.replace(/[,\s]/g, '')) : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : undefined;
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parallelSeries(record: ApiRecord): ApiRecord[] {
  const dates = firstValue(record, ['dates', 'labels', 'bucket_starts', 'timestamps']);
  if (!Array.isArray(dates)) return [];

  const arrays = [...requestKeys, ...successKeys, ...failedKeys, 'total_tokens', 'tokens', 'cost', 'cost_usd']
    .map((key) => [key, record[key]] as const)
    .filter((entry): entry is readonly [string, unknown[]] => Array.isArray(entry[1]));
  if (!arrays.length) return [];

  return dates.map((date, index) => {
    const item: ApiRecord = { bucket_start: date };
    for (const [key, values] of arrays) item[key] = values[index];
    return item;
  });
}

function trendItems(payload: unknown, depth = 0): ApiRecord[] {
  const direct = recordArray(payload);
  if (direct.length || depth > 5 || !isRecord(payload)) return direct;

  const parallel = parallelSeries(payload);
  if (parallel.length) return parallel;

  for (const key of itemArrayKeys) {
    const value = payload[key];
    const items = recordArray(value);
    if (items.length) return items;
    const nested = trendItems(value, depth + 1);
    if (nested.length) return nested;
  }
  for (const value of Object.values(payload)) {
    if (!isRecord(value)) continue;
    const nested = trendItems(value, depth + 1);
    if (nested.length) return nested;
  }
  return [];
}

export function normalizeUsageTrend(payload: unknown): UsageTrendItem[] {
  return trendItems(payload).map((value) => {
    const sourceDate = firstValue(value, dateKeys);
    let requestCount = firstNumber(value, requestKeys);
    let successCount = firstNumber(value, successKeys);
    let failedCount = firstNumber(value, failedKeys);

    if (requestCount === undefined) requestCount = (successCount ?? 0) + (failedCount ?? 0);
    if (successCount === undefined) successCount = Math.max(0, requestCount - (failedCount ?? 0));
    if (failedCount === undefined) failedCount = Math.max(0, requestCount - successCount);
    requestCount = Math.max(requestCount, successCount + failedCount);

    return {
      ...value,
      bucket_start: sourceDate === undefined ? undefined : String(sourceDate),
      request_count: requestCount,
      success_count: successCount,
      failed_count: failedCount,
      total_tokens: firstNumber(value, ['total_tokens', 'tokens']) ?? 0,
      cost: firstNumber(value, ['cost', 'cost_usd', 'total_cost']) ?? 0,
    };
  });
}
