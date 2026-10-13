import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { providerDate, reminderTime, zonedDayStart } from "../js/time.js";
import { nextOccurrence } from "../js/alerts.js";
import { upcomingEconomic } from "../js/economic-calendar.js";
import { mergeLocal } from "../js/reminder-sync.js";

test("Toronto provider timestamps and day boundaries are independent of device timezone", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = zone;
      assert.equal(
        providerDate("2026-10-13T06:00", "America/Toronto").toISOString(),
        "2026-10-13T10:00:00.000Z",
      );
      assert.equal(
        zonedDayStart(
          new Date("2026-10-13T02:00Z"),
          "America/Toronto",
        ).toISOString(),
        "2026-10-12T04:00:00.000Z",
      );
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
test("recurring reminders preserve Toronto civil time through DST and clamp month ends", () => {
  const daily = { at: reminderTime("2026-03-07T09:00"), repeat: "daily" };
  assert.equal(
    new Date(
      nextOccurrence(daily, Date.parse("2026-03-08T00:00Z")).at,
    ).toISOString(),
    "2026-03-08T13:00:00.000Z",
  );
  const monthly = { at: reminderTime("2026-01-31T09:00"), repeat: "monthly" };
  assert.equal(
    nextOccurrence(monthly, reminderTime("2026-02-01T00:00")).at,
    reminderTime("2026-02-28T09:00"),
  );
  assert.equal(
    nextOccurrence(monthly, reminderTime("2026-03-01T00:00")).at,
    reminderTime("2026-03-31T09:00"),
  );
  assert.equal(nextOccurrence({ ...monthly, archived: true }), null);
});
test("economic releases leave upcoming at release time and untimed entries roll over at Toronto midnight", () => {
  const events = [
    { date: "2026-10-13", time: "08:30" },
    { date: "2026-10-13", time: "" },
    { date: "2026-10-14", time: "08:30" },
  ];
  assert.equal(
    upcomingEconomic(events, new Date("2026-10-13T12:29Z"), "America/Toronto")
      .length,
    3,
  );
  assert.deepEqual(
    upcomingEconomic(events, new Date("2026-10-13T12:30Z"), "America/Toronto"),
    events.slice(1),
  );
  assert.deepEqual(
    upcomingEconomic(events, new Date("2026-10-14T04:00Z"), "America/Toronto"),
    events.slice(2),
  );
});
test("local edits made during a sync survive the older server response", () => {
  const old = {
    id: "one",
    title: "Before",
    at: 1,
    updatedAt: 1,
    repeat: "none",
    archived: false,
  };
  assert.equal(
    mergeLocal([old], [{ ...old, title: "After", updatedAt: 2 }])[0].title,
    "After",
  );
});
test("a weather module load failure leaves the clock, calendar and navigation initialized", async () => {
  await promisify(execFile)(process.execPath, [
    "--experimental-vm-modules",
    "--input-type=module",
    "-e",
    `
    import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
    const initialized=[],events=[],errors=[];
    const context=vm.createContext({console:{warn(){}},navigator:{onLine:true},localStorage:{},location:{},Event:class{constructor(type){this.type=type}},setInterval(){},
      document:{getElementById:id=>({classList:{toggle(){}},style:{},appendChild:()=>errors.push(id)}),createElement:()=>({})},window:{addEventListener(){},dispatchEvent:event=>events.push(event.type)}});
    const stub=async exports=>{const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});await m.link(()=>{});await m.evaluate();return m;};
    const main=new vm.SourceTextModule(await readFile('js/app.js','utf8'),{context,importModuleDynamically:async path=>{
      if(path==='./weather.js')throw Error('fixture missing weather module');
      const names={'./alerts.js':'initAlerts','./dashboard.js':'initDashboard','./clock.js':'initClock','./solunar.js':'initFishingIndicator','./calendar.js':'initCalendar','./spotify.js':'initSpotify','./appearance.js':'initAppearance','./lifecycle.js':'initLifecycle'};
      return stub({[names[path]]:()=>initialized.push(path)});
    }});
    await main.link(path=>stub(path.includes('config')?{CONFIG:{camera:{feeds:[]}}}:{createDailyReloadCheck:()=>()=>{}}));await main.evaluate();
    await new Promise(resolve=>setImmediate(resolve));
    for(const path of ['./clock.js','./calendar.js','./dashboard.js'])assert.ok(initialized.includes(path));
    assert.deepEqual(events,['maison-ready']);assert.deepEqual(errors,['tile-weather']);
  `,
  ]);
});
test("offline shell serves owned assets after network loss and never intercepts private or external requests", async () => {
  const handlers = {},
    entries = new Map(),
    removed = [];
  const cache = {
    async addAll(assets) {
      for (const asset of assets)
        entries.set(asset, new Response("cached " + asset));
    },
    async match(path) {
      return entries.get(path);
    },
  };
  let claimed = false,
    activated = false;
  const template = await readFile(
    new URL("../scripts/sw-template.js", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    template
      .replace("__CACHE_NAME__", JSON.stringify("maison-new"))
      .replace(
        "__ASSETS__",
        JSON.stringify(["/", "/settings.html", "/js/app.js"]),
      ),
    {
      URL,
      fetch: () => {
        throw Error("network down");
      },
      caches: {
        open: async () => cache,
        keys: async () => ["maison-old", "maison-new", "other-app"],
        delete: async (name) => removed.push(name),
      },
      self: {
        location: { origin: "https://panel.test" },
        addEventListener: (name, fn) => (handlers[name] = fn),
        clients: { claim: async () => (claimed = true) },
        skipWaiting: () => (activated = true),
      },
    },
  );
  let work;
  handlers.install({ waitUntil: (p) => (work = p) });
  await work;
  for (const path of ["/", "/settings.html", "/js/app.js"]) {
    handlers.fetch({
      request: new Request("https://panel.test" + path),
      respondWith: (p) => (work = p),
    });
    assert.equal(await (await work).text(), "cached " + path);
  }
  for (const url of [
    "https://panel.test/api/calendar",
    "https://panel.test/api/reminders",
    "https://accounts.google.com/",
  ]) {
    let intercepted = false;
    handlers.fetch({
      request: new Request(url),
      respondWith: () => (intercepted = true),
    });
    assert.equal(intercepted, false);
  }
  assert.equal(activated, false);
  handlers.message({ data: { type: "ACTIVATE" } });
  assert.equal(activated, true);
  handlers.activate({ waitUntil: (p) => (work = p) });
  await work;
  assert.deepEqual(removed, ["maison-old"]);
  assert.ok(claimed);
});
