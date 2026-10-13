// The only file meant to be hand-edited day to day. See docs/project-brief.md for what each
// section means and why (§4 config, §5 tile specs, §9 build order / open questions).

export const CONFIG = {
  ui: { defaultTheme: "auto", hourlyCount: 5, hourlyStep: 3 },
  location: { lat: 45.167, lon: -73.517, label: "Sherrington" }, // Confirmed home municipality; Celsius, Toronto time.
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
    provider: "tradingview", // Four ETF benchmarks, without an FMP subscription or API key.
    fmpKey: "", // Enter a replacement key per device in settings.html. Never commit credentials.
    marketHours: { startHourEt: 9, startMinuteEt: 30, endHourEt: 16 },
    symbols: [
      { sym: "SPY", label: "S&P 500" },
      { sym: "QQQ", label: "Nasdaq 100" },
      { sym: "DIA", label: "Dow Jones" },
      { sym: "IWM", label: "Russell 2000" },
    ],
  },

  calendar: {
    calendarId: "kevincaron28@gmail.com", // the calendar to show
  },

  // Camera images use the owner-authenticated relay. LAN addresses and the bridge secret
  // stay in the PC's private configuration, outside this public repository. Each feed:
  //   id           stable short id, used as a DOM key — keep it simple (e.g. "front-door")
  //   name         shown under the thumbnail
  //   snapshotUrl  same-origin private endpoint or HTTPS image URL — required
  //   refreshMs    how often to re-fetch the snapshot (default: refresh.camera below)
  //   enabled      set false to keep a feed configured but hidden, without deleting it
  // Example:
  //   { id: "front-door", name: "Front door", snapshotUrl: "http://192.168.1.60/snapshot.jpg", enabled: true }
  camera: { feeds: [{ id: "home", name: "Maison · HM203", snapshotUrl: "/api/camera/snapshot", controlUrl: "/api/camera/control", refreshMs: 5000, enabled: true, private: true }] },

  spotify: {
    // From developer.spotify.com/dashboard — not secret (PKCE doesn't use a client secret), safe
    // to ship in this public file. Leave blank to hide the tile entirely. The redirect URI
    // registered on that app must exactly match this page's own URL (see js/spotify.js) — a
    // mismatch is the most common login failure.
    clientId: "3e80bb70bf2c4eb09d71a79aa665311c",
    refresh: 10 * 1000,
  },

  dailyReloadHour: 3,
};
