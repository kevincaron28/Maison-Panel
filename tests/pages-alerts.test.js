import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { reminderTime, dueReminders, dueEconomic, readReminders } from "../js/alerts.js";
import { weatherWarning } from "../js/weather.js";
import { computeDayPeriods } from "../js/solunar.js";
test("dedicated pages contain unique IDs, working internal destinations and matching modules",async()=>{
  for (const page of ["markets","fishing"]) {
    const dom = new JSDOM(await readFile(new URL(`../${page}.html`,import.meta.url),"utf8"));
    const ids = [...dom.window.document.querySelectorAll("[id]")].map(e=>e.id);
    assert.equal(ids.length,new Set(ids).size);
    assert.equal(dom.window.document.querySelectorAll("h1").length,1);
    for (const target of ["markets.html","fishing.html","./"]) assert.ok(dom.window.document.querySelector(`a[href="${target}"]`));
    assert.ok(dom.window.document.querySelector('script[src="js/details.js"]'));
    dom.window.close();
  }
});
test("Toronto reminders follow DST and reject nonexistent times",()=>{
  assert.equal(reminderTime("2026-10-28T09:45"),Date.parse("2026-10-28T13:45Z"));
  assert.equal(reminderTime("2026-12-09T09:45"),Date.parse("2026-12-09T14:45Z"));
  assert.ok(Number.isNaN(reminderTime("2026-03-08T02:30")));
  assert.ok(Number.isNaN(reminderTime("bad")));
});
test("alerts include upcoming reminders and expire old events",()=>{
  const now = Date.parse("2026-10-13T14:00Z");
  assert.deepEqual(dueReminders([{at:now-7200000},{at:now+3600000},{at:now+90000000}],now),[{at:now+3600000}]);
  assert.ok(dueEconomic(new Date(now),{timezone:"America/Toronto"}).some(e=>e.title.includes("IPC")));
  assert.equal(dueEconomic(new Date("2027-01-01T12:00Z"),{timezone:"America/Toronto"}).length,0);
  assert.deepEqual(readReminders({getItem:()=>'{"broken":true}'}),[]);
});
test("freezing precipitation is flagged as a dangerous forecast",()=>{
  const data = {daily:{},current:{},hourly:{time:[new Date(Date.now()+3600000).toISOString()],weather_code:[67]}};
  assert.equal(weatherWarning(data,{locale:"fr-CA",units:{temp:"celsius",wind:"kmh"}}).level,"danger");
});
test("fishing sun times belong to the selected day",()=>{
  const day = new Date(2026,9,12);
  const {sunTimes} = computeDayPeriods(day,45.167,-73.517);
  assert.equal(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto"}).format(sunTimes.sunrise),"2026-10-12");
});
