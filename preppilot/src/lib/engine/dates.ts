// Timezone-aware calendar helpers. A "dayKey" is YYYY-MM-DD in the student's own timezone.

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

function parts(date: Date, timeZone: string) {
  const out: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(date)) out[p.type] = p.value;
  return out;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar day of `date` in `timeZone`. */
export function dayKey(date: Date, timeZone = "Asia/Kolkata"): string {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Local minutes since midnight of `date` in `timeZone`. */
export function localMinutes(date: Date, timeZone = "Asia/Kolkata"): number {
  const p = parts(date, timeZone);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** Local hour (0-23). */
export function localHour(date: Date, timeZone = "Asia/Kolkata"): number {
  return Math.floor(localMinutes(date, timeZone) / 60);
}

// Pure calendar arithmetic on day keys (UTC-noon anchored, so DST can never shift the day).
function keyToUtcNoon(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
}
function utcToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: string, n: number): string {
  return utcToKey(keyToUtcNoon(key) + n * 86_400_000);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((keyToUtcNoon(b) - keyToUtcNoon(a)) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(key: string): number {
  return (new Date(keyToUtcNoon(key)).getUTCDay() + 6) % 7;
}

export function weekStart(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function isDayKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(keyToUtcNoon(s)) && utcToKey(keyToUtcNoon(s)) === s;
}

// ── HH:MM helpers ──
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function toHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type TimeBucket = "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT";
export function timeBucket(hour: number): TimeBucket {
  if (hour >= 5 && hour < 12) return "MORNING";
  if (hour >= 12 && hour < 17) return "AFTERNOON";
  if (hour >= 17 && hour < 21) return "EVENING";
  return "NIGHT";
}

export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}
