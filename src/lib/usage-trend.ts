import type { ApiRecord, UsageTrendItem } from '@/src/types/api';

const itemArrayKeys = ['trend', 'series', 'points', 'buckets', 'items', 'rows', 'list', 'data'];
const dateKeys = ['bucket_date', 'bucket_start', 'period_start', 'interval_start', 'bucket_time', 'time_bucket', 'start_time', 'bucket', 'date', 'day', 'period', 'key', 'label', 'time', 'timestamp', 'created_at'];
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
  const dates = firstValue(record, ['dates', 'labels', 'bucket_starts', 'period_starts', 'timestamps']);
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

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validDateKey(yearValue: string, monthValue: string, dayValue: string) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return localDateKey(date);
}

function dateKeyFromValue(value: unknown) {
  const source = value === undefined || value === null ? '' : String(value).trim();
  const fullDate = source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (fullDate) return validDateKey(fullDate[1], fullDate[2], fullDate[3]);

  const compactDate = source.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) return validDateKey(compactDate[1], compactDate[2], compactDate[3]);

  const timestamp = Number(source);
  if (Number.isFinite(timestamp) && timestamp >= 1e9) {
    const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    if (!Number.isNaN(date.getTime())) return localDateKey(date);
  }

  if (source) {
    const date = new Date(source);
    if (!Number.isNaN(date.getTime())) return localDateKey(date);
  }
  return undefined;
}

export function usageTrendDateKey(item: UsageTrendItem) {
  return dateKeyFromValue(firstValue(item, dateKeys));
}

function normalizedTrendItem(value: ApiRecord): UsageTrendItem {
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
}

function mergeTrendItems(current: UsageTrendItem, item: UsageTrendItem, bucketStart: string): UsageTrendItem {
  return {
    ...current,
    bucket_start: bucketStart,
    request_count: (current.request_count ?? 0) + (item.request_count ?? 0),
    success_count: (current.success_count ?? 0) + (item.success_count ?? 0),
    failed_count: (current.failed_count ?? 0) + (item.failed_count ?? 0),
    total_tokens: (current.total_tokens ?? 0) + (item.total_tokens ?? 0),
    cost: (current.cost ?? 0) + (item.cost ?? 0),
  };
}

export function normalizeUsageTrend(payload: unknown): UsageTrendItem[] {
  const grouped = new Map<string, UsageTrendItem>();
  const undated: UsageTrendItem[] = [];

  for (const value of trendItems(payload)) {
    const item = normalizedTrendItem(value);
    const dateKey = usageTrendDateKey(item);
    if (!dateKey) {
      undated.push(item);
      continue;
    }

    const current = grouped.get(dateKey);
    grouped.set(dateKey, current ? mergeTrendItems(current, item, dateKey) : { ...item, bucket_start: dateKey });
  }

  return [...grouped.values()].sort((left, right) => String(left.bucket_start).localeCompare(String(right.bucket_start))).concat(undated);
}

export function buildRecentUsageTrend(items: UsageTrendItem[], days = 7, now = new Date()) {
  const dayCount = Math.max(1, Math.floor(days));
  const dates = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (dayCount - index - 1));
    return localDateKey(date);
  });
  const dateSet = new Set(dates);
  const grouped = new Map<string, UsageTrendItem>();
  const undated: UsageTrendItem[] = [];

  for (const item of items) {
    const dateKey = usageTrendDateKey(item);
    if (!dateKey) {
      undated.push(item);
      continue;
    }
    if (!dateSet.has(dateKey)) continue;
    const current = grouped.get(dateKey);
    grouped.set(dateKey, current ? mergeTrendItems(current, item, dateKey) : { ...item, bucket_start: dateKey });
  }

  if (!grouped.size && undated.length) {
    const fallbackItems = undated.slice(-dayCount);
    const offset = dayCount - fallbackItems.length;
    fallbackItems.forEach((item, index) => grouped.set(dates[offset + index], { ...item, bucket_start: dates[offset + index] }));
  }

  return dates.map((date) => grouped.get(date) ?? {
    bucket_start: date,
    request_count: 0,
    success_count: 0,
    failed_count: 0,
    total_tokens: 0,
    cost: 0,
  });
}

export function usageTrendDateLabel(item: UsageTrendItem, index: number, total: number, now = new Date()) {
  const dateKey = usageTrendDateKey(item);
  if (dateKey) {
    const [, month, day] = dateKey.split('-');
    return `${Number(month)}/${Number(day)}`;
  }

  const raw = firstValue(item, dateKeys);
  const source = raw === undefined ? '' : String(raw).trim();
  const compactDate = source.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) return `${Number(compactDate[2])}/${Number(compactDate[3])}`;

  const fullDate = source.match(/\d{4}[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (fullDate) return `${Number(fullDate[1])}/${Number(fullDate[2])}`;

  const shortDate = source.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (shortDate) return `${Number(shortDate[1])}/${Number(shortDate[2])}`;

  const timestamp = Number(source);
  if (Number.isFinite(timestamp) && timestamp >= 1e9) {
    const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    if (!Number.isNaN(date.getTime())) return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  if (source && !/^\d+$/.test(source)) return source.slice(0, 8);

  const fallback = new Date(now);
  fallback.setHours(12, 0, 0, 0);
  fallback.setDate(fallback.getDate() - Math.max(0, total - index - 1));
  return `${fallback.getMonth() + 1}/${fallback.getDate()}`;
}
