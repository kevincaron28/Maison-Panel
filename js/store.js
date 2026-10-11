// Shared localStorage cache + staleness/backoff helper. Every tile is independent (brief §6):
// a fetch failure must fall back to the last-good cached payload, dimmed, rather than go blank.

const PREFIX = "maison-panel:";

export function loadCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    const cached = raw ? JSON.parse(raw) : null;
    return cached && cached.data != null && Number.isFinite(cached.fetchedAt)
      ? cached
      : null;
  } catch {
    return null; // corrupt or inaccessible storage — treat as no cache, never throw
  }
}

export function saveCache(key, data) {
  try {
    localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ data, fetchedAt: Date.now() }),
    );
  } catch {
    // storage full/unavailable — the tile still has the in-memory value this tick
  }
}

export function formatUpdatedAt(timestampMs) {
  const d = new Date(timestampMs);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `updated ${hh}:${mm}`;
}

// Runs `fetcher` on an interval, caching successes and falling back to the last-good cache (via
// `onData(data, { stale })`) on failure. Backoff doubles the interval on repeated failures, capped
// at 30 minutes, and resets to `intervalMs` on the next success.
export function createPoller({ key, intervalMs, fetcher, onData, onError }) {
  const MAX_INTERVAL_MS = 30 * 60 * 1000;
  let currentInterval = intervalMs;
  let timer = null;
  let running = false;
  let inFlight = false;
  let lastGood = loadCache(key);

  function deliver(cached, stale) {
    try {
      onData(cached.data, { stale, fetchedAt: cached.fetchedAt });
    } catch (err) {
      report(err);
    }
  }
  function report(err) {
    try {
      onError?.(err);
    } catch {
      /* a status renderer must not break scheduling */
    }
  }

  async function tick() {
    if (!running || inFlight) return;
    inFlight = true;
    try {
      const data = await fetcher();
      if (!running) return;
      lastGood = { data, fetchedAt: Date.now() };
      saveCache(key, data);
      currentInterval = intervalMs;
      deliver(lastGood, false);
    } catch (err) {
      if (!running) return;
      report(err);
      if (lastGood) deliver(lastGood, true);
      currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL_MS);
    } finally {
      inFlight = false;
      if (running) timer = setTimeout(tick, currentInterval);
    }
  }

  function start() {
    if (running) return;
    running = true;
    if (lastGood) deliver(lastGood, true);
    tick();
  }

  function stop() {
    running = false;
    if (timer) clearTimeout(timer);
  }

  return { start, stop };
}
