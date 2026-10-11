export function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour) % 24,
  };
}

// Persist BEFORE navigation. When storage is unavailable, skip automatic reloads entirely.
// This avoids both the original 3am reload loop and an offline kiosk losing its visible page.
export function createDailyReloadCheck(
  config,
  { storage, reload, available, now = () => new Date() },
) {
  let checking = false;
  return async function check() {
    if (checking || config.dailyReloadHour == null) return;
    const current = zonedParts(now(), config.timezone);
    if (current.hour !== config.dailyReloadHour) return;
    checking = true;
    try {
      const key = "maison-panel:last-reload-day";
      if (storage.getItem(key) === current.day || !(await available())) return;
      storage.setItem(key, current.day);
      reload();
    } catch {
      // A working panel is more valuable than a scheduled refresh.
    } finally {
      checking = false;
    }
  };
}
