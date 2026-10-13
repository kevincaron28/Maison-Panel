import test from 'node:test';
import assert from 'node:assert/strict';
import { morningDue, forecastBrief, economicBrief, spokenEconomy } from '../js/morning.js';
import { completedSession } from '../worker/morning-markets.js';

test('morning schedule uses Toronto time across DST, catches up only before 11 and does not repeat', () => {
  for (const [day, utc] of [['2026-10-13',11],['2026-11-02',12]]) {
    const now = new Date(`${day}T${utc}:00:00Z`);
    assert.equal(morningDue(new Date(+now - 1000), null), false);
    assert.equal(morningDue(now, null), true);
    assert.equal(morningDue(now, day), false);
    assert.equal(morningDue(new Date(+now + 4*3600000), null), false);
  }
});
test('market recap excludes today and null closes, uses last trading session and rejects old data', () => {
  const chart = {chart:{result:[{timestamp:['2026-10-08','2026-10-09','2026-10-12'].map(d => Date.parse(d+'T14:00Z')/1000),indicators:{quote:[{close:[100,102,104]}]}}]}};
  assert.deepEqual(completedSession(chart,'2026-10-12'),{date:'2026-10-09',close:102,change:2.0000000000000018});
  assert.throws(() => completedSession(chart,'2026-11-01'));
  chart.chart.result[0].indicators.quote[0].close[1] = null;
  assert.throws(() => completedSession(chart,'2026-10-12'));
});
test('forecast must contain today, fresh data and real values', () => {
  const cache = {fetchedAt:1000,data:{daily:{time:['2026-10-13'],temperature_2m_max:[12],temperature_2m_min:[3],precipitation_probability_max:[0],wind_speed_10m_max:[10],weather_code:[0]}}};
  assert.match(forecastBrief(cache,'2026-10-13',1001),/Maximum 12 degrés/);
  assert.match(forecastBrief(cache,'2026-10-13',1001,'en-CA'),/high of 12 degrees Celsius/);
  assert.match(forecastBrief(cache,'2026-10-14',1001),/indisponibles/);
  assert.match(forecastBrief(cache,'2026-10-13',86400000),/indisponibles/);
  cache.data.daily.temperature_2m_max = [null];
  assert.match(forecastBrief(cache,'2026-10-13',1001),/incomplètes/);
});
test('economic events preserve source links and distinguish empty from expired coverage', () => {
  assert.equal(economicBrief('2026-10-14').events.length,1);
  assert.match(economicBrief('2026-10-14').events[0].source,/bls.gov/);
  assert.match(economicBrief('2026-10-13').note,/pas exhaustif/);
  assert.match(economicBrief('2027-01-01').note,/expiré/);
  assert.match(spokenEconomy('2026-10-14'),/United States, consumer price inflation/);
  assert.match(spokenEconomy('2027-01-01'),/expired/);
});
