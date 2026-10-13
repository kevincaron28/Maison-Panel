import { ECONOMIC_EVENTS, ECONOMIC_VALID_UNTIL } from "./economic-events.js";
import { zonedParts } from "./runtime.js";
import { reminderTime, addDays } from "./time.js";
export { reminderTime } from "./time.js";

export const REMINDERS_KEY = "maison-panel:reminders";
export function readReminders(storage) {
  try {
    const data = JSON.parse((storage || localStorage).getItem(REMINDERS_KEY));
    return Array.isArray(data) ? data.filter(e=>e && typeof e.title === "string" && e.title.length<=120 && typeof e.id === "string" && Number.isFinite(e.at)).slice(0,1000) : [];
  } catch { return []; }
}
export function dueReminders(events, now = Date.now()) {
  return events.filter(e=>!e.archived).map(e=>nextOccurrence(e, now-3600000)).filter(e=>e && e.at <= now+86400000).sort((a,b)=>a.at-b.at);
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
  const format = at => new Intl.DateTimeFormat(config.locale,{timeZone:config.timezone,month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(at));
  function render() {
    const rows = [];
    for (const event of dueReminders(readReminders())) rows.push({text:`${format(event.at)} · ${event.title}`,kind:"personal",href:"settings.html#reminders"});
    root.replaceChildren();
    for (const row of rows) {
      const item = document.createElement("a");
      item.className = `daily-alert is-${row.kind}`;
      item.href = row.href; item.textContent = row.text;
      root.append(item);
    }
    if (!rows.length) root.hidden = true;
    else root.hidden = false;
  }
  window.addEventListener("storage",render);
  document.addEventListener("maison-reminders",render);
  document.addEventListener("visibilitychange",render);
  render(); setInterval(render,60000);
}

export function nextOccurrence(entry, after = Date.now(), timezone = "America/Toronto") {
  if (entry.archived) return null;
  if (entry.at >= after) return entry;
  if (!["daily","weekly","monthly"].includes(entry.repeat)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(entry.at)).map(p=>[p.type,p.value]));
  const originalDay = Number(parts.day);
  let day = `${parts.year}-${parts.month}-${parts.day}`;
  for (let index=0;index<40000;index++) {
    if (entry.repeat === "monthly") {
      const date = new Date(day + "T12:00Z");
      date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+1);
      const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
      date.setUTCDate(Math.min(originalDay,last)); day=date.toISOString().slice(0,10);
    } else day=addDays(day,entry.repeat === "weekly" ? 7 : 1);
    const at=reminderTime(`${day}T${parts.hour}:${parts.minute}`,timezone);
    if (Number.isFinite(at) && at >= after) return {...entry,at};
  }
  return null;
}
