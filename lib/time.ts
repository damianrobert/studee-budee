// Day/week logic in the app timezone. A "day key" is a YYYY-MM-DD string for a
// calendar day in that timezone; all streak/week math works on day keys.

export function appTz(): string {
  return process.env.TZ || "Europe/Bucharest";
}

const partsFmtCache = new Map<string, Intl.DateTimeFormat>();

function partsFmt(tz: string): Intl.DateTimeFormat {
  let f = partsFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFmtCache.set(tz, f);
  }
  return f;
}

function wallClock(date: Date, tz: string) {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFmt(tz).formatToParts(date)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(date: Date, tz: string): string {
  const { year, month, day } = wallClock(date, tz);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(key: string): number {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function weekStartKey(key: string): string {
  return addDays(key, 1 - isoWeekday(key));
}

export function monthStartKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Offset of `tz` from UTC at `date`, in ms (positive east of UTC). */
export function tzOffsetMs(date: Date, tz: string): number {
  const w = wallClock(date, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** The UTC instant of 00:00 on `key` in `tz`. */
export function zonedDayStart(key: string, tz: string): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  // Two passes handle a DST change between the guess and the real instant.
  let ts = guess - tzOffsetMs(new Date(guess), tz);
  ts = guess - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

export function todayKey(tz = appTz()): string {
  return dayKey(new Date(), tz);
}
