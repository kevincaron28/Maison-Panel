import { ECONOMIC_EVENTS, ECONOMIC_VALID_UNTIL } from "./economic-events.js";
import { zonedParts } from "./runtime.js";
import { loadCache } from "./store.js";
import { weatherCacheKey, weatherWarning } from "./weather.js";

export const REMINDERS_KEY = "maison-panel:reminders";
export function reminderTime(value, timeZone = "America/Toronto") {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  const target = Date.parse(value + ":00Z");
  let guess = target;
  const parts = ms => Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
  if (!Number.isFinite(guess)) return NaN;
  for (let i=0;i<3;i++) {
    const p = parts(guess);
    guess += target - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  }
  const p = parts(guess);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === value ? guess : NaN;
}
export function readReminders(storage) {
  try {
    const data = JSON.parse((storage || localStorage).getItem(REMINDERS_KEY));
    return Array.isArray(data) ? data.filter(e=>typeof e.title === "string" && e.title.length<=120 && typeof e.id === "string" && Number.isFinite(e.at)).slice(0,100) : [];
  } catch { return []; }
}
export function dueReminders(events, now = Date.now()) {
  return events.filter(e=>e.at >= now-3600000 && e.at <= now+86400000).sort((a,b)=>a.at-b.at);
}
export function dueEconomic(now = new Date(), config) {
  const today = zonedParts(now, config.timezone).day;
  return ECONOMIC_EVENTS.filter(e=> {
    const at = reminderTime(`${e.date}T${e.time || "23:59"}`,config.timezone);
    return e.time ? at >= +now-3600000 && at <= +now+86400000 : e.date === today;
  });
}
export function initAlerts(config, root) {
  if (!root) return;
  let weather = loadCache(weatherCacheKey(config));
  const format = at => new Intl.DateTimeFormat(config.locale,{timeZone:config.timezone,month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(at));
  function render() {
    const rows = [];
    if (!weather || weather.stale || Date.now()-weather.fetchedAt > config.refresh.weather*2) rows.push({text:"Météo non actualisée · vérifiez les conditions avant une sortie.",kind:"notice",href:"fishing.html"});
    else {
      const warning = weatherWarning(weather.data, config);
      if (warning) rows.push({text:`Prévision à surveiller · ${warning.text}`,kind:warning.level,href:"fishing.html"});
    }
    for (const event of dueReminders(readReminders())) rows.push({text:`${format(event.at)} · ${event.title}`,kind:"personal",href:"settings.html#reminders"});
    for (const event of dueEconomic(new Date(),config)) rows.push({text:`Économie · ${event.title} · ${event.date} · ${event.time || "heure à confirmer"}`,kind:"economic",href:"markets.html#economic-calendar"});
    if (zonedParts(new Date(),config.timezone).day > ECONOMIC_VALID_UNTIL) rows.push({text:"Dates économiques à actualiser · consultez le calendrier en ligne.",kind:"notice",href:"markets.html#economic-calendar"});
    root.replaceChildren();
    for (const row of rows) {
      const item = document.createElement("a");
      item.className = `daily-alert is-${row.kind}`;
      item.href = row.href; item.textContent = row.text;
      root.append(item);
    }
    if (!rows.length) root.textContent = "Aucun rappel enregistré dans les prochaines 24 h.";
  }
  document.addEventListener("maison-weather", event => { weather = {data:event.detail.data,...event.detail.meta}; render(); });
  window.addEventListener("storage",render);
  document.addEventListener("visibilitychange",render);
  render(); setInterval(render,60000);
}
