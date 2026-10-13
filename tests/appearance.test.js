import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
test("automatic themes follow sunrise and sunset and ignore old dimming presets", async (t) => {
  const dom = new JSDOM(await readFile(new URL("../index.html",import.meta.url),"utf8"),{url:"https://example.test"});
  t.mock.property(globalThis,"localStorage",dom.window.localStorage);
  localStorage.setItem("maison-panel:home-mode",JSON.stringify({name:"away"}));
  let date = new Date("2026-10-12T23:00Z");
  const doc = dom.window.document;
  const app = initAppearance(config,doc,{now:()=>date});
  t.after(()=>{app.stop();dom.window.close();});
  assert.equal(doc.documentElement.dataset.theme,"night");
  assert.equal(localStorage.getItem("maison-panel:home-mode"),null);
  assert.equal(doc.querySelector("[data-home-mode]"),null);
  assert.equal(doc.body.classList.contains("is-night"),false);
  date = solarState(config,date).nextRise; app.refresh();
  assert.equal(doc.documentElement.dataset.theme,"paper");
  date = solarState(config,date).sunset; app.refresh();
  assert.equal(doc.documentElement.dataset.theme,"night");
  const theme = doc.createElement("button");theme.id="theme-toggle";doc.body.append(theme);
  const settingsAppearance=initAppearance(config,doc,{now:()=>date});t.after(()=>settingsAppearance.stop());
  theme.click();
  assert.equal(doc.documentElement.dataset.theme,"paper");
  theme.click();
  assert.equal(doc.documentElement.dataset.theme,"night");
  theme.click();
  assert.match(theme.textContent,/auto/);
});
