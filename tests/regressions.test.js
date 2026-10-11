import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate as flush } from "node:timers/promises";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { rateDay, initSolunar, computeDayPeriods } from "../js/solunar.js";
import { weatherWarning, hourlyIndices } from "../js/weather.js";
import { initDashboard } from "../js/dashboard.js";
import { createDailyReloadCheck, zonedParts } from "../js/runtime.js";
import { loadCache, createPoller } from "../js/store.js";
import { fetchJson } from "../js/network.js";
import { fetchQuote, initMarkets } from "../js/markets.js";
import { getValidAccessToken, redirectUri, requestSpotify, initSpotify } from "../js/spotify.js";
import { getMoonPosition } from "../vendor/suncalc.js";
import { createMusicControls } from "../js/music-controls.js";
import { initCamera } from "../js/camera.js";

for (const name of ["localStorage", "document", "location", "window"]) {
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
  t.mock.property(globalThis, "window", dom.window);
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
  document.querySelector('[data-panel="tile-solunar"]').click();
  assert.equal(document.getElementById("tile-side").hidden, false);
  assert.equal(document.querySelector(".solunar-details").hidden, false);
  document.getElementById("explorer-close").click();
  assert.equal(document.activeElement.dataset.panel,"tile-solunar");
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
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status, json: async () => ({error: status === 400 ? "invalid_grant" : "server_error"}) }));
  await assert.rejects(getValidAccessToken("fixture-client"), /503/);
  assert.ok(saved.getItem("maison-panel:spotify-tokens"));
  status = 400;
  assert.equal(await getValidAccessToken("fixture-client"), null);
  assert.equal(saved.getItem("maison-panel:spotify-tokens"), null);
});

test("Spotify uses one callback for root, index.html and preview paths", () => {
  for (const pathname of ["/", "/index.html", "/design/live.html"])
    assert.equal(redirectUri({origin: "https://maison-panel.kcaron.workers.dev", pathname}), "https://maison-panel.kcaron.workers.dev/");
});

test("Spotify configuration errors do not erase the saved refresh token", async (t) => {
  t.mock.property(globalThis, "localStorage", storage());
  localStorage.setItem("maison-panel:spotify-tokens", JSON.stringify({accessToken:"fixture", refreshToken:"fixture-refresh", expiresAt:0}));
  t.mock.method(globalThis, "fetch", async () => ({ok:false, status:400, json:async () => ({error:"invalid_client"})}));
  await assert.rejects(getValidAccessToken("fixture-client"), /400/);
  assert.ok(localStorage.getItem("maison-panel:spotify-tokens"));
});

test("fishing opens with complete windows and tomorrow changes the schedule", async (t) => {
  const dom = new JSDOM(await readFile(new URL("../index.html", import.meta.url), "utf8"));
  t.mock.property(globalThis, "document", dom.window.document);
  t.mock.method(globalThis, "setInterval", () => 1);
  const root = document.getElementById("tile-solunar");
  initSolunar({...config, location:{lat:45.167,lon:-73.517},refresh:{solunar:300000}},root);
  assert.equal(root.querySelector(".solunar-details").hidden, false);
  const before = root.querySelector(".solunar-periods").textContent;
  assert.match(before, /Majeure/);
  assert.match(before, /Mineure/);
  assert.match(before, /pic/);
  assert.ok(root.querySelectorAll("time").length >= 3);
  root.querySelector('[data-fishing-day="1"]').click();
  assert.notEqual(root.querySelector(".solunar-periods").textContent,before);
  assert.equal(root.querySelector('[data-fishing-day="1"]').getAttribute("aria-pressed"),"true");
  dom.window.close();
});

test("solunar events are ordered and never invent a midnight transit", () => {
  for (let day=1; day<=31; day++) {
    const {periods} = computeDayPeriods(new Date(2026,9,day),45.167,-73.517);
    assert.deepEqual(periods.map(p=>+p.center),periods.map(p=>+p.center).sort((a,b)=>a-b));
    const major = periods.filter(p=>p.kind === "major");
    assert.ok(major.length >= 1 && major.length <= 2);
    for (const period of major) {
      const altitude = (offset) => getMoonPosition(new Date(+period.center+offset),45.167,-73.517).altitude;
      if (period.label === "moon transit") assert.ok(altitude(0)>altitude(-60000) && altitude(0)>=altitude(60000));
      else assert.ok(altitude(0)<altitude(-60000) && altitude(0)<=altitude(60000));
    }
  }
});

test("Spotify renews a rejected access token once and retries playback without disconnecting", async (t) => {
  t.mock.property(globalThis,"localStorage",storage());
  localStorage.setItem("maison-panel:spotify-tokens",JSON.stringify({accessToken:"old",refreshToken:"fixture-refresh",expiresAt:Date.now()+3600000}));
  const calls = [];
  t.mock.method(globalThis,"fetch",async (url, options) => {
    calls.push(String(url));
    if (String(url).includes("/api/token")) return {ok:true,json:async()=>({access_token:"fresh",expires_in:3600})};
    if (options.headers.Authorization === "Bearer old") return {ok:false,status:401};
    return {ok:true,status:200,text:async()=>JSON.stringify({item:{name:"Fixture track"},is_playing:true})};
  });
  assert.equal((await requestSpotify("fixture-client","GET","")).item.name,"Fixture track");
  assert.equal(calls.length,3);
  assert.equal(JSON.parse(localStorage.getItem("maison-panel:spotify-tokens")).refreshToken,"fixture-refresh");
});

test("existing Spotify session renders track, speaker and all playback controls", async (t) => {
  const dom = new JSDOM(await readFile(new URL("../index.html",import.meta.url),"utf8"),{url:"https://maison-panel.kcaron.workers.dev/"});
  t.mock.property(globalThis,"document",dom.window.document);
  t.mock.property(globalThis,"location",dom.window.location);
  t.mock.property(globalThis,"localStorage",storage());
  t.mock.method(globalThis,"setTimeout",()=>1);
  localStorage.setItem("maison-panel:spotify-tokens",JSON.stringify({accessToken:"fixture",refreshToken:"fixture-refresh",expiresAt:Date.now()+3600000}));
  t.mock.method(globalThis,"fetch",async()=>({ok:true,status:200,text:async()=>JSON.stringify({item:{name:"Fixture track",artists:[{name:"Fixture artist"}]},device:{name:"Cuisine",volume_percent:40},is_playing:true})}));
  const root = document.getElementById("tile-spotify");
  initSpotify({spotify:{clientId:"fixture-client",refresh:10000}},root);
  await flush();
  assert.match(root.textContent,/Fixture track/);
  assert.match(root.textContent,/Cuisine/);
  for (const name of ["Précédent","Pause","Suivant","Volume moins","Volume plus"]) assert.ok(root.querySelector(`[aria-label="${name}"]`));
  assert.equal(root.querySelector(".spotify-connect-btn"),null);
  dom.window.close();
});

test("music controls send shuffle, repeat, seek, volume and speaker transfer with correct payloads", async (t) => {
  const dom = new JSDOM(await readFile(new URL("../index.html",import.meta.url),"utf8"),{url:"https://maison-panel.kcaron.workers.dev/"});
  t.mock.property(globalThis,"document",dom.window.document);
  t.mock.property(globalThis,"location",dom.window.location);
  t.mock.property(globalThis,"localStorage",storage());
  t.mock.method(globalThis,"setTimeout",()=>1);
  localStorage.setItem("maison-panel:spotify-tokens",JSON.stringify({accessToken:"fixture",refreshToken:"fixture-refresh",expiresAt:Date.now()+3600000}));
  const writes = [];
  const playback = {item:{name:"Fixture",artists:[],duration_ms:180000},device:{id:"kitchen",name:"Cuisine",supports_volume:true,volume_percent:40},is_playing:true,shuffle_state:false,repeat_state:"off",progress_ms:20000,actions:{disallows:{}}};
  t.mock.method(globalThis,"fetch",async(url,options)=> {
    const target = new URL(url);
    if (options.method !== "GET") {
      writes.push({method:options.method,path:target.pathname,params:target.searchParams,body:options.body});
      if (target.pathname.endsWith("/shuffle")) playback.shuffle_state = true;
      if (target.pathname.endsWith("/repeat")) playback.repeat_state = "context";
      return {ok:true,status:204};
    }
    return {ok:true,status:200,text:async()=>JSON.stringify(target.pathname.endsWith("/devices") ? {devices:[{id:"kitchen",name:"Cuisine",is_active:true},{id:"living",name:"Salon"},{id:"restricted",name:"Bloqué",is_restricted:true}]} : playback)};
  });
  initSpotify({spotify:{clientId:"fixture-client",refresh:10000}},document.getElementById("tile-spotify"));
  await flush();
  document.querySelector(".music-more").click();
  await flush();
  assert.equal(document.querySelector(".music-dialog").hidden,false);
  assert.equal(document.querySelectorAll("#music-device-select option").length,2);
  for (const action of ["shuffle","repeat"]) {
    document.querySelector(`[data-action="${action}"]`).click(); await flush();
  }
  const seek = document.getElementById("music-seek");
  seek.value = "60000"; seek.dispatchEvent(new dom.window.Event("change")); await flush();
  const volume = document.getElementById("music-volume");
  volume.value = "35"; volume.dispatchEvent(new dom.window.Event("change")); await flush();
  document.getElementById("music-device-select").value = "living";
  document.querySelector('[data-action="transfer"]').click(); await flush();
  assert.equal(writes[0].params.get("state"),"true");
  assert.equal(writes[1].params.get("state"),"context");
  assert.equal(writes[2].params.get("position_ms"),"60000");
  assert.equal(writes[3].params.get("volume_percent"),"35");
  assert.deepEqual(JSON.parse(writes[4].body),{device_ids:["living"],play:true});
  assert.equal(writes[4].path,"/v1/me/player");
  assert.equal(document.querySelector('[data-action="shuffle"]').getAttribute("aria-pressed"),"true");
  document.querySelector('[data-action="close"]').click();
  assert.equal(document.getElementById("panel").inert,false);
  dom.window.close();
});

test("music controls respect device restrictions and preserve a slider being edited", (t) => {
  const dom = new JSDOM('<div id="panel"><footer id="music"></footer></div>');
  t.mock.property(globalThis,"document",dom.window.document);
  const ui = createMusicControls(document.getElementById("music"),{devices(){}});
  const state = {status:"playing",track:{name:"Fixture",artists:"Fixture"},durationMs:120000,progressMs:1000,volumePercent:50,supportsVolume:false,disallows:{seeking:true,skipping_next:true,toggling_shuffle:true}};
  ui.update(state); ui.open();
  for (const selector of ['#music-volume','#music-seek','[data-action="next"]','[data-action="shuffle"]']) assert.equal(document.querySelector(selector).disabled,true);
  ui.update({...state,supportsVolume:true,disallows:{}});
  const slider = document.getElementById("music-volume");
  slider.focus(); slider.value="23";
  ui.update({...state,supportsVolume:true,disallows:{},volumePercent:60});
  assert.equal(slider.value,"23");
  assert.equal(document.activeElement,slider);
  dom.window.close();
});

test("markets show all four benchmarks in a separate origin without exposing app storage", async (t) => {
  const dom = new JSDOM(await readFile(new URL("../index.html", import.meta.url), "utf8"),{url:"https://maison-panel.kcaron.workers.dev/"});
  t.mock.property(globalThis,"document",dom.window.document);
  t.mock.property(globalThis,"location",dom.window.location);
  const root = document.getElementById("tile-markets");
  initMarkets({markets:{provider:"tradingview"}},root);
  const frame = root.querySelector("iframe");
  const url = new URL(frame.src);
  assert.equal(url.origin,"https://www.tradingview-widget.com");
  assert.deepEqual(JSON.parse(decodeURIComponent(url.hash.slice(1))).tabs[0].symbols.map(s=>s.s),["AMEX:SPY","NASDAQ:QQQ","AMEX:DIA","AMEX:IWM"]);
  assert.equal(root.querySelector(".market-toggle").hidden,true);
  assert.equal(root.querySelectorAll("script").length,0);
  dom.window.close();
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
