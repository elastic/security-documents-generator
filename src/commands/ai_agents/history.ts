import { faker } from '@faker-js/faker';

/**
 * Quiet history before the generated window (`--history-days`). Scenarios write it on the hosts and
 * OS users their live sessions use, so it lands on the same agents. Days are UTC, and the window's
 * own day only has the live scenarios, so `days` days of data are the window's day plus the
 * `days - 1` days before it.
 */

export const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** UTC midnight of the day `at` falls in. */
const dayOf = (at: number): number => at - (at % DAY_MS);

/** UTC midnights of the history days before the window's day, oldest first. */
export const historyDays = (start: number, days: number): number[] => {
  const today = dayOf(start);
  return Array.from(
    { length: Math.max(days - 1, 0) },
    (_, index) => today - (days - 1 - index) * DAY_MS,
  );
};

/** The first history day, or `start` with no history. Hosts boot before it. */
export const historyStart = (start: number, days: number): number =>
  historyDays(start, days)[0] ?? start;

/** A cron job at `minuteOfDay` (UTC) on every history day. */
export const nightlyStarts = (start: number, days: number, minuteOfDay: number): number[] =>
  historyDays(start, days).map((day) => day + minuteOfDay * MINUTE_MS);

const isWeekday = (day: number): boolean => ![0, 6].includes(new Date(day).getUTCDay());

const WORKING_HOURS = [9, 10, 11, 13, 14, 15, 16];

export interface WeekdayOptions {
  /** Days before the window's day with no sessions, inclusive, as if on leave. */
  readonly away?: { readonly from: number; readonly to: number };
  readonly maxPerDay?: number;
}

/** One to `maxPerDay` session starts in UTC working hours on each history weekday, at least an hour apart. */
export const weekdayStarts = (
  start: number,
  days: number,
  { away, maxPerDay = 3 }: WeekdayOptions = {},
): number[] => {
  const today = dayOf(start);
  return historyDays(start, days).flatMap((day) => {
    const daysAgo = (today - day) / DAY_MS;
    if (!isWeekday(day) || (away && daysAgo >= away.from && daysAgo <= away.to)) {
      return [];
    }
    const count = faker.number.int({ min: 1, max: maxPerDay });
    return faker.helpers
      .arrayElements(WORKING_HOURS, count)
      .sort((a, b) => a - b)
      .map(
        (hour) => day + hour * 60 * MINUTE_MS + faker.number.int({ min: 0, max: 40 }) * MINUTE_MS,
      );
  });
};
