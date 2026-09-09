// The only file meant to be hand-edited day to day. See docs/project-brief.md for what each
// section means and why (§4 config, §5 tile specs, §9 build order / open questions).

export const CONFIG = {
  location: { lat: 45.167, lon: -73.517, label: "Maison" }, // Sherrington, QC (J0L 2N0) — brief §11.5 answered
  timezone: "America/Toronto",
  locale: "fr-CA", // TODO: confirm French vs English on the panel (brief §11.3)
  units: { temp: "celsius", wind: "kmh" },

  refresh: {
    weather: 15 * 60 * 1000,
    calendar: 10 * 60 * 1000,
    markets: 15 * 60 * 1000, // free FMP is end-of-day, not live — this is as tight as it's worth polling
    solunar: 5 * 60 * 1000, // cheap, it's local math
    camera: 2 * 1000,
  },

  markets: {
    fmpKey: "74x4tq9TNGGBWIzhgEae7rHWHw6RPffq", // direct client-side fetch, one symbol at a time — no server involved
    marketHours: { startHourEt: 9, startMinuteEt: 30, endHourEt: 16 },
    symbols: [
      { sym: "SPY", label: "S&P 500" },
      { sym: "QQQ", label: "Nasdaq 100" },
      { sym: "DIA", label: "Dow" },
      { sym: "IWM", label: "Russell 2000" },
    ],
  },

  calendar: {
    mode: "embed", // "embed" = private iframe, your own Google login on the tablet (current choice)
    calendarId: "kevincaron28@gmail.com", // the calendar to show
    googleApiKey: "", // only used if you ever switch mode to "api" (see docs/project-brief.md §5.3)
  },

  // Add a camera by adding a feed here — no code changes needed. Blocked on brand/model, brief
  // §11.2, so this stays empty for now. Each feed:
  //   id           stable short id, used as a DOM key — keep it simple (e.g. "front-door")
  //   name         shown under the thumbnail
  //   snapshotUrl  LAN http:// URL returning a still image (most IP cameras have one) — required
  //   refreshMs    how often to re-fetch the snapshot (default: refresh.camera below)
  //   enabled      set false to keep a feed configured but hidden, without deleting it
  // Example:
  //   { id: "front-door", name: "Front door", snapshotUrl: "http://192.168.1.60/snapshot.jpg", enabled: true }
  camera: { feeds: [] },

  speakers: {
    enabled: false, // flip on once the bridge (see /server) is running and reachable
    bridgeUrl: "", // e.g. "http://192.168.1.50:8787" — the PC/Pi running the speaker bridge
    refresh: 10 * 1000,
  },

  night: { start: 21, end: 6, dimTo: 0.35 },
  dailyReloadHour: 3,
};
