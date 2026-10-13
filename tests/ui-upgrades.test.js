import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate as flush } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { initWeather } from "../js/weather.js";
import { initForecastDialog } from "../js/forecast-dialog.js";
import { initCalendar } from "../js/calendar.js";
import { initCamera } from "../js/camera.js";
import { CONFIG } from "../config.js";
for (const name of [
  "document",
  "window",
  "location",
  "localStorage",
  "sessionStorage",
])
  if (!(name in globalThis))
    Object.defineProperty(globalThis, name, {
      value: undefined,
      writable: true,
      configurable: true,
    });
async function page(t) {
  const dom = new JSDOM(
    await readFile(new URL("../index.html", import.meta.url), "utf8"),
    { url: "https://panel.test", pretendToBeVisual: true },
  );
  for (const name of [
    "document",
    "window",
    "location",
    "localStorage",
    "sessionStorage",
  ])
    t.mock.property(globalThis, name, dom.window[name]);
  t.after(() => dom.window.close());
  return dom;
}
test("settings add, edit, repeat, archive and restore a reminder without duplicating it", async t => {
  const dom = new JSDOM(await readFile(new URL("../settings.html", import.meta.url), "utf8"), {url:"https://panel.test"});
  for (const name of ["document","window","location","localStorage","sessionStorage"]) t.mock.property(globalThis,name,dom.window[name]);
  t.mock.property(globalThis,"Event",dom.window.Event);
  t.mock.method(globalThis,"setInterval",()=>1);
  t.mock.method(globalThis,"setTimeout",()=>1);
  t.mock.method(globalThis,"fetch",async()=>Response.json({error:"sign_in_required"},{status:401}));
  await import("../js/settings.js?ui-test"); await flush(); await flush();
  const q=id=>document.getElementById(id);
  q("reminder-title").value="Fixture collection";
  q("reminder-time").value="2099-01-31T09:00";
  q("reminder-repeat").value="monthly";
  q("reminder-form").dispatchEvent(new dom.window.Event("submit",{cancelable:true}));
  assert.equal(q("reminder-list").children.length,1);
  assert.match(q("reminder-list").textContent,/chaque mois/);
  q("reminder-list").querySelector("button").click();
  q("reminder-title").value="Fixture edited";
  q("reminder-form").dispatchEvent(new dom.window.Event("submit",{cancelable:true}));
  assert.equal(q("reminder-list").children.length,1);assert.match(q("reminder-list").textContent,/Fixture edited/);
  q("reminder-list").querySelectorAll("button")[1].click();
  assert.equal(q("reminder-list").children.length,0);assert.equal(q("reminder-archive").children.length,1);
  q("reminder-archive").querySelector("button").click();
  assert.equal(q("reminder-list").children.length,1);assert.equal(q("reminder-archive").children.length,0);
  await flush();dom.window.close();
});
test("weather renders before optional air quality and updates the expanded forecast dialog", async (t) => {
  await page(t);
  t.mock.method(globalThis, "setTimeout", () => 1);
  const day = "2026-10-13";
  const data = {
    current: {
      time: day + "T06:00",
      temperature_2m: 12,
      apparent_temperature: 10,
      weather_code: 0,
      is_day: 0,
      wind_speed_10m: 5,
      wind_direction_10m: 180,
    },
    daily: {
      time: [day],
      weather_code: [0],
      temperature_2m_max: [20],
      temperature_2m_min: [8],
      sunrise: [day + "T07:00"],
      sunset: [day + "T18:00"],
      precipitation_probability_max: [10],
      precipitation_sum: [0],
      wind_speed_10m_max: [10],
    },
    hourly: {
      time: [day + "T09:00"],
      weather_code: [0],
      temperature_2m: [15],
      precipitation_probability: [10],
    },
  };
  let resolveAir;
  t.mock.method(globalThis, "fetch", async (url) =>
    String(url).includes("air-quality")
      ? new Promise((resolve) => (resolveAir = resolve))
      : Response.json(data),
  );
  initForecastDialog();
  const instance = initWeather(CONFIG, document.getElementById("tile-weather"));
  await flush();
  await flush();
  assert.match(document.querySelector(".hero-temp").textContent, /12/);
  assert.equal(
    document.querySelectorAll(".forecast-dialog .day-row").length,
    1,
  );
  resolveAir(Response.json({ current: { us_aqi: 20, pm2_5: 2 } }));
  await flush();
  await flush();
  assert.match(document.getElementById("today-strip").textContent, /Bon/);
  instance.stop();
});
test("native agenda renders safely, distinguishes all-day events and clears private content after logout", async (t) => {
  await page(t);
  let refresh;
  t.mock.method(globalThis, "setTimeout", (fn) => {
    refresh = fn;
    return 1;
  });
  let authorized = true;
  t.mock.method(globalThis, "fetch", async () =>
    authorized
      ? Response.json({
          events: [
            {
              summary: "<script>fixture</script>",
              start: { date: "2026-10-14" },
            },
            {
              summary: "Timed fixture",
              start: { dateTime: "2026-10-14T15:00:00Z" },
            },
          ],
        })
      : Response.json({ error: "sign_in_required" }, { status: 401 }),
  );
  const instance = initCalendar(
    CONFIG,
    document.getElementById("tile-calendar"),
  );
  await flush();
  assert.equal(document.querySelectorAll(".agenda-events li").length, 2);
  assert.equal(document.querySelector(".agenda-events script"), null);
  assert.match(
    document.querySelector(".agenda-events").textContent,
    /toute la journée/,
  );
  authorized = false;
  await refresh();
  assert.equal(document.querySelectorAll(".agenda-events li").length, 0);
  instance.stop();
});
test("cross-tab logout clears agenda immediately and ignores an in-flight response", async (t) => {
  const dom = await page(t);
  let refresh, resolvePending;
  t.mock.method(globalThis, "setTimeout", (fn) => { refresh = fn; return 1; });
  const events = [{summary: "Private fixture", start: {date: "2026-10-14"}}];
  let first = true;
  t.mock.method(globalThis, "fetch", async () => {
    if (first) { first = false; return Response.json({events}); }
    return new Promise(resolve => { resolvePending = resolve; });
  });
  const instance = initCalendar(CONFIG, document.getElementById("tile-calendar"));
  await flush();
  assert.equal(document.querySelectorAll(".agenda-events li").length, 1);
  const pending = refresh();
  window.dispatchEvent(new dom.window.StorageEvent("storage", {key: "maison-panel:logout", newValue: "1"}));
  assert.equal(document.querySelectorAll(".agenda-events li").length, 0);
  resolvePending(Response.json({events}));
  await pending;
  assert.equal(document.querySelectorAll(".agenda-events li").length, 0);
  instance.stop();
});

test("camera stops hidden polling and exponentially backs off failures", async (t) => {
  const dom = await page(t);
  let timer, delay;
  t.mock.method(globalThis, "setTimeout", (fn, ms) => {
    timer = fn;
    delay = ms;
    return 1;
  });
  const root = document.getElementById("tile-cameras"),
    dialog = root.closest("dialog");
  initCamera(
    {
      ...CONFIG,
      camera: {
        feeds: [
          {
            id: "one",
            name: "Fixture",
            snapshotUrl: "https://camera.test/snapshot",
            refreshMs: 2000,
          },
        ],
      },
    },
    root,
  );
  const img = root.querySelector("img");
  assert.equal(img.hasAttribute("src"), false);
  assert.equal(timer, undefined);
  dialog.open = true;
  document.dispatchEvent(new dom.window.Event("maison-camera-visibility"));
  assert.ok(img.src.startsWith("https://camera.test/snapshot"));
  img.dispatchEvent(new dom.window.Event("error"));
  assert.equal(delay, 4000);
  timer();
  img.dispatchEvent(new dom.window.Event("error"));
  assert.equal(delay, 8000);
  img.dispatchEvent(new dom.window.Event("load"));
  assert.equal(delay, 2000);
  dialog.open = false;
  timer = undefined;
  document.dispatchEvent(new dom.window.Event("maison-camera-visibility"));
  assert.equal(timer, undefined);
});
