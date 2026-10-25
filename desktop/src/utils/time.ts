const pad = (n: number) => String(n).padStart(2, '0');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 8 -> "8s", 268 -> "4m 28s", 4320 -> "1h 12m". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (total < 3600) return `${minutes}m ${pad(total % 60)}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "08:30:12" today, "Yesterday 22:14", "2 Oct 22:14" earlier, with the year when it is not this one. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const dayDifference = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDifference === 0) return `${clock}:${pad(date.getSeconds())}`;
  if (dayDifference === 1) return `Yesterday ${clock}`;
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year} ${clock}`;
}

/** The full local date and time, for tooltips. */
export function formatExact(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

/** "4 Oct 14:00": a day and a time to the minute, for naming a window. */
export function formatDayTime(ms: number): string {
  const date = new Date(ms);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "14:00": a time to the minute. */
export function formatClock(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "4 Oct": a day. */
export function formatDay(ms: number): string {
  const date = new Date(ms);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "Just now", "12 min ago" or "3 hours ago" for the same day, and formatWhen for anything older. */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (startOfDay(now) === startOfDay(date)) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  return formatWhen(iso, now);
}

/** "09:43" for a moment today, and formatWhen ("Yesterday 22:14", "2 Oct 22:14") for an earlier day. */
export function formatClockOrDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (startOfDay(now) === startOfDay(date)) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return formatWhen(iso, now);
}
