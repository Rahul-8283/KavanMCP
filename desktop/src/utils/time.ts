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
