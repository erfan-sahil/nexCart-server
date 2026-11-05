import { DASHBOARD_RANGE_DAYS, type DashboardRange } from './dashboard.constants';
import type { DashboardPeriodMetric } from './dashboard.types';

export type TimeWindow = {
  start: Date;
  end: Date;
};

export type SeriesBucket = 'day' | 'month';

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const periodMetric = (current: number, previous: number): DashboardPeriodMetric => {
  const roundedCurrent = money(current);
  const roundedPrevious = money(previous);
  let changePercent: number | null = null;

  if (roundedPrevious !== 0) {
    changePercent = money(((roundedCurrent - roundedPrevious) / roundedPrevious) * 100);
  }

  return {
    current: roundedCurrent,
    previous: roundedPrevious,
    changePercent,
  };
};

export const getWindows = (
  range: DashboardRange,
): { current: TimeWindow; previous: TimeWindow; days: number } => {
  const days = DASHBOARD_RANGE_DAYS[range];
  const end = new Date();
  const currentStart = new Date(end);
  currentStart.setTime(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

  const previousEnd = new Date(currentStart);
  const previousStart = new Date(previousEnd);
  previousStart.setTime(previousStart.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    current: { start: currentStart, end },
    previous: { start: previousStart, end: previousEnd },
    days,
  };
};

export const getWindowsForDays = (
  days: number,
): { current: TimeWindow; previous: TimeWindow; days: number } => {
  const end = new Date();
  const currentStart = new Date(end);
  currentStart.setTime(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

  const previousEnd = new Date(currentStart);
  const previousStart = new Date(previousEnd);
  previousStart.setTime(previousStart.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    current: { start: currentStart, end },
    previous: { start: previousStart, end: previousEnd },
    days,
  };
};

export const getMonthWindows = (): {
  current: TimeWindow;
  previous: TimeWindow;
  bucketCount: number;
} => {
  const end = new Date();
  const currentStart = new Date(end);
  currentStart.setMonth(currentStart.getMonth() - 12);

  const previousEnd = new Date(currentStart);
  const previousStart = new Date(previousEnd);
  previousStart.setMonth(previousStart.getMonth() - 12);

  return {
    current: { start: currentStart, end },
    previous: { start: previousStart, end: previousEnd },
    bucketCount: 12,
  };
};

const dateKeyUtcDay = (date: Date) => date.toISOString().slice(0, 10);

const dateKeyInTimezone = (date: Date, timezone: string, bucket: SeriesBucket) => {
  if (bucket === 'month') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    return `${year}-${month}`;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
};

const advanceBucketCursor = (cursor: Date, bucket: SeriesBucket) => {
  const next = new Date(cursor);

  if (bucket === 'month') {
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  next.setUTCDate(next.getUTCDate() + 1);
  return next;
};

export const fillSeries = <T extends Record<string, number>>(
  window: TimeWindow,
  options: {
    bucket: SeriesBucket;
    bucketCount: number;
    timezone: string;
    rows: Array<{ key: string; values: T }>;
    defaults: T;
  },
): Array<{ date: string } & T> => {
  const byKey = new Map(options.rows.map((row) => [row.key, row.values]));
  const series: Array<{ date: string } & T> = [];

  const cursor = new Date(window.start);
  if (options.bucket === 'day' && options.timezone === 'UTC') {
    cursor.setUTCHours(0, 0, 0, 0);
  }

  for (let i = 0; i < options.bucketCount; i += 1) {
    const dateKey =
      options.timezone === 'UTC' && options.bucket === 'day'
        ? dateKeyUtcDay(cursor)
        : dateKeyInTimezone(cursor, options.timezone, options.bucket);

    const values = byKey.get(dateKey) ?? options.defaults;
    series.push({ date: dateKey, ...values });

    if (i < options.bucketCount - 1) {
      const advanced = advanceBucketCursor(cursor, options.bucket);
      cursor.setTime(advanced.getTime());
    }
  }

  return series;
};

export const averageOrderValue = (grossSales: number, orders: number) =>
  orders > 0 ? money(grossSales / orders) : 0;
