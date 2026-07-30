import test from 'node:test';
import assert from 'node:assert/strict';

import { localCalendarRange } from '../src/lib/calendar-range.ts';

function localParts(iso) {
  const value = new Date(iso);
  return {
    year: value.getFullYear(),
    month: value.getMonth(),
    date: value.getDate(),
    day: value.getDay(),
    hours: value.getHours(),
    minutes: value.getMinutes(),
    seconds: value.getSeconds(),
    milliseconds: value.getMilliseconds(),
  };
}

test('day starts at local midnight instead of 24 hours ago', () => {
  const now = new Date(2026, 6, 30, 20, 32, 35, 400);
  const range = localCalendarRange('day', now);

  assert.deepEqual(localParts(range.from), {
    year: 2026,
    month: 6,
    date: 30,
    day: 4,
    hours: 0,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });
  assert.equal(range.to, now.toISOString());
  assert.ok(new Date(range.from).getTime() > now.getTime() - 24 * 60 * 60 * 1000);
});

test('week starts at local Monday midnight', () => {
  const range = localCalendarRange('week', new Date(2026, 6, 30, 20, 32));
  assert.deepEqual(localParts(range.from), {
    year: 2026,
    month: 6,
    date: 27,
    day: 1,
    hours: 0,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });
});

test('month starts on the first day at local midnight', () => {
  const range = localCalendarRange('month', new Date(2026, 6, 30, 20, 32));
  assert.deepEqual(localParts(range.from), {
    year: 2026,
    month: 6,
    date: 1,
    day: 3,
    hours: 0,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });
});

test('day starts at local midnight across a daylight-saving transition', () => {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const now = new Date('2026-03-08T16:00:00.000Z');
    const range = localCalendarRange('day', now);

    assert.equal(range.from, '2026-03-08T05:00:00.000Z');
    assert.equal(range.to, now.toISOString());
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});
