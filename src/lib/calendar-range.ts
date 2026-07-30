export type CalendarRange = 'day' | 'week' | 'month';

export function localCalendarRange(range: CalendarRange, now = new Date()) {
  const to = new Date(now.getTime());
  const from = new Date(now.getTime());

  if (range === 'month') {
    from.setDate(1);
  } else if (range === 'week') {
    const daysSinceMonday = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - daysSinceMonday);
  }

  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}
