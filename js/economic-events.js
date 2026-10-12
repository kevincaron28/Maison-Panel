// Selected official dates checked October 12, 2026. Not a live or exhaustive feed.
export const ECONOMIC_VALID_UNTIL = "2026-12-31";
const BLS = "https://www.bls.gov/schedule/2026/home.htm";
const BOC = "https://www.bankofcanada.ca/2025/08/bank-canada-publishes-2026-schedule-policy-interest-rate-announcements-other-major-publications/";
const FED = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
export const ECONOMIC_EVENTS = [
  ["2026-10-14", "08:30", "États-Unis · inflation IPC", BLS],
  ["2026-10-15", "08:30", "États-Unis · prix à la production", BLS],
  ["2026-10-19", "10:30", "Canada · perspectives des entreprises", BOC],
  ["2026-10-28", "09:45", "Canada · décision de taux", BOC],
  ["2026-10-28", "", "États-Unis · décision de la Fed", FED],
  ["2026-11-06", "08:30", "États-Unis · emploi", BLS],
  ["2026-11-10", "08:30", "États-Unis · inflation IPC", BLS],
  ["2026-11-13", "08:30", "États-Unis · prix à la production", BLS],
  ["2026-12-04", "08:30", "États-Unis · emploi", BLS],
  ["2026-12-09", "09:45", "Canada · décision de taux", BOC],
  ["2026-12-09", "", "États-Unis · décision de la Fed", FED],
  ["2026-12-10", "08:30", "États-Unis · inflation IPC", BLS],
  ["2026-12-15", "08:30", "États-Unis · prix à la production", BLS],
].map(([date,time,title,source]) => ({date,time,title,source}));
