import { zonedParts } from "./runtime.js";
export function reminderTime(value, timeZone = "America/Toronto") {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  const target = Date.parse(value + ":00Z");
  let guess = target;
  const parts = (ms) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(ms))
        .map((p) => [p.type, p.value]),
    );
  if (!Number.isFinite(guess)) return NaN;
  for (let i = 0; i < 3; i++) {
    const p = parts(guess);
    guess +=
      target -
      Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  }
  const p = parts(guess);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === value
    ? guess
    : NaN;
}

export function addDays(day, count) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function zonedDayStart(date, timezone) {
  return new Date(
    reminderTime(zonedParts(date, timezone).day + "T00:00", timezone),
  );
}
export function providerDate(value, timezone = "America/Toronto") {
  if (typeof value === "number") return new Date(value * 1000);
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return new Date(value);
  return new Date(reminderTime(value.slice(0, 16), timezone));
}
