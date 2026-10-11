import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate as flush } from "node:timers/promises";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { rateDay } from "../js/solunar.js";
import { weatherWarning, hourlyIndices } from "../js/weather.js";
import { initDashboard } from "../js/dashboard.js";
import { createDailyReloadCheck, zonedParts } from "../js/runtime.js";
import { loadCache, createPoller } from "../js/store.js";
import { fetchJson } from "../js/network.js";
import { fetchQuote } from "../js/markets.js";
import { getValidAccessToken } from "../js/spotify.js";
import { initCamera } from "../js/camera.js";

for (const name of ["localStorage", "document", "location"]) {
  if (!(name in globalThis))
    Object.defineProperty(globalThis, name, {
      value: undefined,
      writable: true,
      configurable: true,
    });
}

function storage() {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}

test("forecast overview shows five spaced times and never wraps expired data to midnight", () => {
  const times = Array.from(
    { length: 24 },
    (_, hour) => `2026-10-11T${String(hour).padStart(2, "0")}:00:00Z`,
  );
  assert.deepEqual(
    hourlyIndices(times, new Date("2026-10-11T08:30:00Z")),
    [9, 12, 15, 18, 21],
  );
  assert.deepEqual(hourlyIndices(times, new Date("2026-10-12T00:00:00Z")), []);
});

test("new dashboard defaults to A and disclosure controls work", async (t) => {
  const dom = new JSDOM(
    await readFile(new URL("../index.html", import.meta.url), "utf8"),
  );
  t.mock.property(globalThis, "document", dom.window.document);
  t.mock.property(globalThis, "localStorage", storage());
  initDashboard(
    { ui: { defaultTheme: "night" } },
    document.getElementById("panel"),
  );
  assert.equal(document.documentElement.dataset.theme, "night");
  assert.equal(
    document.querySelector(".greeting").textContent,
    "Bienvenue, famille Caron.",
  );
  document.getElementById("explorer-open").click();
  assert.equal(document.getElementById("tile-side").hidden, false);
  document.getElementById("explorer-close").click();
  assert.equal(document.getElementById("tile-side").hidden, true);
  document.getElementById("forecast-toggle").click();
  assert.equal(document.getElementById("forecast-days").hidden, false);
  dom.window.close();
});
const config = {
  timezone: "America/Toronto",
  dailyReloadHour: 3,
  locale: "fr-CA",
  units: { temp: "celsius", wind: "kmh" },
};
const weather = (code) => ({
  daily: {
    wind_gusts_10m_max: [10],
    precipitation_probability_max: [70],
    precipitation_sum: [3],
    temperature_2m_min: [10],
    temperature_2m_max: [20],
  },
  current: {},
  hourly: {
    time: [new Date(Date.now() + 3600000).toISOString()],
    weather_code: [code],
  },
});

test("fishing rating peaks at new/full moon and bottoms at quarter moon", () => {
  assert.equal(rateDay(0, [], {}), 4);
  assert.equal(rateDay(1, [], {}), 4);
  assert.equal(rateDay(0.5, [], {}), 0);
});
test("rain shower WMO codes are not snow; actual snow is still announced", () => {
  for (const code of [80, 81, 82])
    assert.equal(weatherWarning(weather(code), config), null);
  for (const code of [71, 73, 75, 77, 85, 86])
    assert.match(weatherWarning(weather(code), config).text, /Neige/);
});
test("temperature and gust warning thresholds respect Fahrenheit and mph", () => {
  const data = weather(0);
  data.daily.temperature_2m_max = [75];
  data.daily.temperature_2m_min = [40];
  const imperial = { ...config, units: { temp: "fahrenheit", wind: "mph" } };
  assert.equal(weatherWarning(data, imperial), null);
  data.daily.wind_gusts_10m_max = [40];
  assert.match(weatherWarning(data, imperial).text, /Rafales/);
});
test("reload happens once per Toronto date across fresh app instances", async () => {
  const saved = storage();
  let calls = 0;
  const dependencies = {
    storage: saved,
    reload: () => calls++,
    available: async () => true,
    now: () => new Date("2026-10-11T07:05:00Z"),
  };
  await createDailyReloadCheck(config, dependencies)();
  await createDailyReloadCheck(config, dependencies)();
  assert.equal(calls, 1);
  await createDailyReloadCheck(config, {
    ...dependencies,
    now: () => new Date("2026-10-12T07:05:00Z"),
  })();
  assert.equal(calls, 2);
});
test("blocked storage, offline and non-reload hour never navigate away", async () => {
  let calls = 0;
  const deps = {
    storage: storage(),
    reload: () => calls++,
    available: async () => false,
    now: () => new Date("2026-10-11T07:05:00Z"),
  };
  await createDailyReloadCheck(config, deps)();
  await createDailyReloadCheck(config, {
    ...deps,
    available: async () => true,
    storage: {
      getItem: () => {
        throw Error("blocked");
      },
    },
  })();
  await createDailyReloadCheck(config, {
    ...deps,
    available: async () => true,
    now: () => new Date("2026-10-11T12:00:00Z"),
  })();
  assert.equal(calls, 0);
});
test("reload clock follows Toronto through DST changes", () => {
  assert.equal(
    zonedParts(new Date("2026-11-01T08:00:00Z"), config.timezone).hour,
    3,
  );
  assert.equal(
    zonedParts(new Date("2026-03-08T07:00:00Z"), config.timezone).hour,
    3,
  );
});
test("corrupt cache entries are rejected", (t) => {
  t.mock.property(globalThis, "localStorage", storage());
  for (const bad of [
    "null",
    "{",
    '{"data":{}}',
    '{"data":{},"fetchedAt":"bad"}',
  ]) {
    localStorage.setItem("maison-panel:test", bad);
    assert.equal(loadCache("test"), null);
  }
});
test("stopping a poller during an outstanding request prevents render and reschedule", async (t) => {
  t.mock.property(globalThis, "localStorage", storage());
  let resolve,
    renders = 0;
  const timeout = t.mock.method(globalThis, "setTimeout", () => 42);
  const poller = createPoller({
    key: "test",
    intervalMs: 50,
    fetcher: () => new Promise((r) => (resolve = r)),
    onData: () => renders++,
  });
  poller.start();
  poller.stop();
  resolve({ value: 1 });
  await flush();
  assert.equal(renders, 0);
  assert.equal(timeout.mock.callCount(), 0);
});
test("poller retains memory cache when localStorage is unavailable and retries fail", async (t) => {
  t.mock.property(globalThis, "localStorage", {
    getItem: () => null,
    setItem: () => {
      throw Error("full");
    },
  });
  let next,
    attempt = 0;
  const output = [];
  t.mock.method(globalThis, "setTimeout", (fn) => {
    next = fn;
    return 1;
  });
  const poller = createPoller({
    key: "test",
    intervalMs: 50,
    fetcher: async () => {
      if (attempt++) throw Error("offline");
      return { temp: 18 };
    },
    onData: (data, meta) => output.push({ data, meta }),
  });
  poller.start();
  await flush();
  await next();
  poller.stop();
  assert.equal(output.length, 2);
  assert.equal(output[1].meta.stale, true);
  assert.equal(output[1].data.temp, 18);
});
test("a hanging request aborts rather than freezing a tile indefinitely", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    (_url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(Error("aborted"))),
      ),
  );
  await assert.rejects(fetchJson("https://example.test", {}, 5), /aborted/);
});
test("FMP error objects are rejected rather than rendered as NaN quotes", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ "Error Message": "Restricted Endpoint" }),
  }));
  await assert.rejects(fetchQuote("TEST", "fixture-key"), /invalid quote/);
});
test("Spotify transient refresh failure preserves credentials; rejected credentials are removed", async (t) => {
  const saved = storage();
  t.mock.property(globalThis, "localStorage", saved);
  saved.setItem(
    "maison-panel:spotify-tokens",
    JSON.stringify({
      accessToken: "fixture",
      refreshToken: "fixture-refresh",
      expiresAt: 0,
    }),
  );
  let status = 503;
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status }));
  await assert.rejects(getValidAccessToken("fixture-client"), /503/);
  assert.ok(saved.getItem("maison-panel:spotify-tokens"));
  status = 400;
  assert.equal(await getValidAccessToken("fixture-client"), null);
  assert.equal(saved.getItem("maison-panel:spotify-tokens"), null);
});
test("legacy startup guard surfaces module failures and dismisses on clock readiness", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html);
  let timeout,
    cleared = false;
  const context = {
    document: dom.window.document,
    window: dom.window,
    location: { reload() {} },
    setTimeout: (fn) => {
      timeout = fn;
      return 1;
    },
    clearTimeout: () => {
      cleared = true;
    },
  };
  vm.runInNewContext(
    await readFile(new URL("../js/boot.js", import.meta.url), "utf8"),
    context,
  );
  timeout();
  assert.match(
    context.document.getElementById("boot-message").textContent,
    /WebView/,
  );
  dom.window.dispatchEvent(new dom.window.Event("maison-ready"));
  assert.equal(cleared, true);
  assert.equal(context.document.getElementById("boot-status").hidden, true);
  dom.window.close();
});
test("configured camera appears, escapes its label, and blocks mixed-content feeds", (t) => {
  const dom = new JSDOM(
    '<section id="camera" hidden><div class="camera-feeds"></div></section>',
    { url: "https://example.test" },
  );
  t.mock.property(globalThis, "document", dom.window.document);
  t.mock.property(globalThis, "location", dom.window.location);
  t.mock.method(globalThis, "setInterval", () => 1);
  const root = document.getElementById("camera");
  initCamera(
    {
      camera: {
        feeds: [
          {
            name: "<img src=x>",
            id: "one",
            snapshotUrl: "https://example.test/snapshot.jpg",
          },
          {
            name: "LAN",
            id: "two",
            snapshotUrl: "http://192.168.1.60/image.jpg",
          },
        ],
      },
      refresh: { camera: 2000 },
    },
    root,
  );
  assert.equal(root.hidden, false);
  assert.equal(root.querySelectorAll("button img").length, 1);
  assert.equal(
    root.querySelector(".camera-feed-label").textContent,
    "<img src=x>",
  );
  assert.match(root.textContent, /HTTPS/);
  dom.window.close();
});
