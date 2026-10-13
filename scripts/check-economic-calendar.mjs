import {
  ECONOMIC_EVENTS,
  ECONOMIC_VALID_UNTIL,
} from "../js/economic-events.js";
import { reminderTime } from "../js/time.js";
const now = new Date();
const days = Math.floor(
  (Date.parse(ECONOMIC_VALID_UNTIL + "T23:59:59Z") - now) / 86400000,
);
const allowed = new Set([
  "www.bls.gov",
  "www.bankofcanada.ca",
  "www.federalreserve.gov",
  "www.statcan.gc.ca",
]);
for (const event of ECONOMIC_EVENTS) {
  if (
    !Number.isFinite(reminderTime(`${event.date}T${event.time || "12:00"}`)) ||
    event.date > ECONOMIC_VALID_UNTIL ||
    !event.title ||
    !allowed.has(new URL(event.source).hostname)
  )
    throw Error("Invalid economic event: " + event.date);
}
if (days <= 30)
  throw Error(
    `Economic schedule expires in ${days} days. Follow docs/economic-calendar-maintenance.md before releasing.`,
  );
console.log(
  `Economic schedule: ${ECONOMIC_EVENTS.length} checked entries; ${days} days until coverage expires.`,
);
