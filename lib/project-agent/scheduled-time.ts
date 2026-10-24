import type { ScheduleSpec } from "./scheduled-types";

type WallTime = { year: number; month: number; day: number; hour: number; minute: number };
function formatter(zone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
}
function parts(ms: number, fmt: Intl.DateTimeFormat): WallTime {
  const value = Object.fromEntries(fmt.formatToParts(new Date(ms))
    .filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  return { year: value.year, month: value.month, day: value.day,
    hour: value.hour, minute: value.minute };
}
function utcWall(v: WallTime) {
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute);
}
function candidates(wall: WallTime, fmt: Intl.DateTimeFormat): number[] {
  const guess = utcWall(wall);
  const valid = new Set<number>();
  for (const shift of [-43_200_000, 0, 43_200_000]) {
    const at = guess + shift;
    const localized = parts(at, fmt);
    const offset = utcWall(localized) - at;
    const candidate = guess - offset;
    const match = parts(candidate, fmt);
    if (Object.keys(wall).every(key =>
      match[key as keyof WallTime] === wall[key as keyof WallTime])) valid.add(candidate);
  }
  return [...valid].sort((a, b) => a - b);
}
export function parseScheduleSpec(input: unknown): ScheduleSpec {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("A schedule specification is required");
  const raw = input as Record<string, unknown>;
  if (!["once", "daily", "weekly"].includes(String(raw.kind)))
    throw new Error("Use once, daily or weekly");
  if (typeof raw.timezone !== "string" || raw.timezone.length > 80)
    throw new Error("Choose an IANA timezone");
  try { formatter(raw.timezone).format(new Date()); }
  catch { throw new Error("Invalid timezone"); }
  const kind = raw.kind as ScheduleSpec["kind"];
  if (kind === "once") {
    if (typeof raw.runAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(raw.runAt))
      throw new Error("One-time schedules need an ISO timestamp with timezone");
    if (!Number.isFinite(Date.parse(raw.runAt)))
      throw new Error("Invalid scheduled date");
    return { kind, timezone: raw.timezone, runAt: new Date(raw.runAt).toISOString() };
  }
  if (typeof raw.localTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.localTime))
    throw new Error("Provide 24-hour localTime, e.g. 08:00");
  if (kind === "daily") return { kind, timezone: raw.timezone, localTime: raw.localTime };
  if (!Array.isArray(raw.weekdays) || !raw.weekdays.length ||
    raw.weekdays.some(v => !Number.isInteger(v) || v < 0 || v > 6))
    throw new Error("Weekly schedules require weekdays 0 (Sunday) through 6");
  return { kind, timezone: raw.timezone, localTime: raw.localTime,
    weekdays: [...new Set(raw.weekdays as number[])].sort() };
}
/** The earliest future wall-clock time; skips nonexistent DST minutes, chooses first repeated minute. */
export function nextScheduledRun(spec: ScheduleSpec, after = Date.now()): string | null {
  if (spec.kind === "once") {
    const moment = Date.parse(spec.runAt!);
    return moment > after ? new Date(moment).toISOString() : null;
  }
  const fmt = formatter(spec.timezone);
  const local = parts(after, fmt);
  const calendar = Date.UTC(local.year, local.month - 1, local.day);
  const [hour, minute] = spec.localTime!.split(":").map(Number);
  for (let offset = 0; offset < 370; offset += 1) {
    const date = new Date(calendar + offset * 86_400_000);
    if (spec.kind === "weekly" && !spec.weekdays!.includes(date.getUTCDay())) continue;
    const wall: WallTime = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1,
      day: date.getUTCDate(), hour, minute };
    const match = candidates(wall, fmt).find(ms => ms > after);
    if (match !== undefined) return new Date(match).toISOString();
  }
  throw new Error("Could not resolve the next scheduled local time");
}
