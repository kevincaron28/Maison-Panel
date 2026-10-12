import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate as flush } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { solarState, weatherMood, initAppearance } from "../js/appearance.js";
import { fishingWindow } from "../js/solunar.js";
if (!("localStorage" in globalThis)) Object.defineProperty(globalThis,"localStorage",{value:undefined,writable:true,configurable:true});

const config = {location:{lat:45.167,lon:-73.517}, timezone:"America/Toronto",locale:"fr-CA"};
test("sunrise and sunset switch themes at the exact boundary across seasons and DST", () => {
  for (const day of ["2026-03-08","2026-06-21","2026-10-12","2026-11-01","2026-12-21"]) {
    const sun = solarState(config, new Date(`${day}T16:00:00Z`));
    assert.equal(solarState(config, new Date(+sun.sunrise - 1)).daylight,false);
    assert.equal(solarState(config, sun.sunrise).daylight,true);
    assert.equal(solarState(config, new Date(+sun.sunset - 1)).daylight,true);
    assert.equal(solarState(config, sun.sunset).daylight,false);
    assert.ok(+sun.nextRise > +sun.sunset);
  }
});
test("weather visual priority respects storms, rain, snow, wind units and stale data", () => {
  const mood = (code,wind=0,units="kmh",stale=false)=>weatherMood({weather_code:code,wind_speed_10m:wind},{wind:units},stale);
  assert.equal(mood(95,50),"storm");
  assert.equal(mood(61,50),"rain");
  assert.equal(mood(85,50),"snow");
  assert.equal(mood(0,30),"wind");
  assert.equal(mood(0,19,"mph"),"wind");
  assert.equal(mood(0),"clear");
  assert.equal(mood(45),"fog");
  assert.equal(mood(3),"cloudy");
  assert.equal(mood(95,0,"kmh",true),"neutral");
});
test("optimal fishing requires an active major window and a strong daily rating", () => {
  const periods = [{kind:"major",center:new Date("2026-10-12T17:00Z"),halfWidthMin:60}];
  assert.equal(fishingWindow(periods,4,Date.parse("2026-10-12T17:30Z")),"optimal");
  assert.equal(fishingWindow(periods,2,Date.parse("2026-10-12T17:30Z")),"active");
  assert.equal(fishingWindow(periods,4,Date.parse("2026-10-12T19:00Z")),"inactive");
  assert.equal(fishingWindow([{...periods[0],kind:"minor"}],4,+periods[0].center),"active");
});
test("presets pause only on explicit clicks, survive reload and sleep ends at sunrise", async (t) => {
  const dom = new JSDOM(await readFile(new URL("../index.html",import.meta.url),"utf8"),{url:"https://example.test"});
  t.mock.property(globalThis,"localStorage",dom.window.localStorage);
  let date = new Date("2026-10-12T23:00Z"), pauses = 0;
  const options = {now:()=>date,pauseMusic:async()=>{pauses++;return "Commande de pause Spotify envoyée.";}};
  let app = initAppearance(config,dom.window.document,options);
  t.after(()=>{app.stop();dom.window.close();});
  const doc = dom.window.document;
  assert.equal(doc.documentElement.dataset.theme,"night");
  doc.querySelector('button[data-home-mode="sleep"]').click(); await flush();
  assert.equal(pauses,1);
  assert.equal(doc.body.classList.contains("is-night"),true);
  assert.match(doc.getElementById("home-mode-status").textContent,/envoyée/);
  app.stop(); app = initAppearance(config,doc,options);
  assert.equal(doc.documentElement.dataset.homeMode,"sleep");
  assert.equal(pauses,1);
  date = solarState(config,date).nextRise; app.refresh();
  assert.equal(doc.documentElement.dataset.homeMode,"home");
  assert.equal(doc.documentElement.dataset.theme,"paper");
  assert.equal(doc.body.classList.contains("is-night"),false);
  doc.querySelector('button[data-home-mode="away"]').click(); await flush();
  date = new Date(+date+86400000); app.refresh();
  assert.equal(doc.documentElement.dataset.homeMode,"away");
  doc.querySelector('button[data-home-mode="home"]').click(); await flush();
  assert.equal(doc.documentElement.dataset.homeMode,"home");
  assert.equal(pauses,2);
  const theme = doc.getElementById("theme-toggle");
  theme.click(); theme.click();
  assert.equal(doc.documentElement.dataset.theme,"night");
  theme.click();
  assert.match(theme.textContent,/auto/);
});
test("pause failure is reported while the panel still enters its requested mode", async (t) => {
  const dom = new JSDOM(await readFile(new URL("../index.html",import.meta.url),"utf8"),{url:"https://example.test"});
  t.mock.property(globalThis,"localStorage",dom.window.localStorage);
  const app = initAppearance(config,dom.window.document,{pauseMusic:async()=>{throw Error("offline");}});
  t.after(()=>{app.stop();dom.window.close();});
  dom.window.document.querySelector('button[data-home-mode="away"]').click(); await flush();
  assert.equal(dom.window.document.documentElement.dataset.homeMode,"away");
  assert.match(dom.window.document.getElementById("home-mode-status").textContent,/non confirmée/);
  assert.equal(dom.window.document.querySelector('button[data-home-mode="away"]').disabled,false);
});
