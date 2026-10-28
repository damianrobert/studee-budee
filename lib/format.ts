import { appTz } from "./time";

/** Server-side date formatting in the app timezone. */
export function fmtDate(
  d: Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: appTz(), ...opts }).format(d);
}

export function fmtDateTime(d: Date): string {
  return fmtDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function fmtRelativeDays(d: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return fmtDate(d);
}
