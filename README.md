# Maison Panel

A wall-mounted Android tablet dashboard — clock, weather, fishing/solunar timing, household calendar,
and a market-indices strip. Read from across a hallway, always on.

Full design rationale, tile specs, and build order: [`docs/project-brief.md`](docs/project-brief.md).
Repo-specific dev notes: [`CLAUDE.md`](CLAUDE.md). Getting this onto an actual tablet:
[`docs/install-guide.md`](docs/install-guide.md).

## Stack

Plain HTML + CSS + vanilla JS modules. No framework, no build step, no bundler, no server. Deployed
as a static site (Cloudflare Workers with static assets); the tablet's browser calls every API
directly (Open-Meteo, FMP, Google Calendar). Solunar/fishing timing is local astronomy math via a
vendored copy of [SunCalc](https://github.com/mourner/suncalc) — no network call for that tile.

[`/server`](server/README.md) (Google Home speaker control) exists in the repo but is currently
**not part of the build** — it's the one feature that would need a real always-on LAN process
(a browser can't do Cast-protocol device discovery), and Kevin's current direction is to keep this
to just the deployed URL, no second machine. See `server/README.md` for details.

## Running locally

```
npx serve .
```

(Any static file server works. Do not open `index.html` via `file://` — that origin breaks CORS.)

## Configuration

Everything you'd tune — location, units, refresh intervals, API keys, market symbols, camera feeds —
lives in [`config.js`](config.js). That's the only file meant to be hand-edited day to day.

## Status

Phases 1–4 (weather, solunar/fishing, calendar, markets) are built, configured, and live on
[`maison-panel.kevincaron28.workers.dev`](https://maison-panel.kevincaron28.workers.dev):

- **Markets** uses Financial Modeling Prep (`config.js` → `markets.fmpKey`), not Finnhub — the free
  tier is end-of-day only, same limitation Finnhub's free tier turned out to have. It fetches each
  symbol individually and sequentially straight from the browser (FMP's multi-symbol batch-quote
  endpoint is paid-plan-only and returns a "Restricted Endpoint" error on the free tier this project
  uses) — no server involved. Genuinely live intraday quotes would need a different, likely paid,
  data source; that's a separate future decision, not a blocker today.
- **Calendar** is a private Google Calendar iframe embed (Path B in the brief) pointed at
  `config.js` → `calendar.calendarId` — nothing needed to be made public, it just needs the
  tablet's browser signed into that Google account.

Camera (`js/camera.js`) is fully built — snapshot polling, live/offline state, tap-to-enlarge —
and just needs feeds added to `config.js` → `camera.feeds` once hardware is picked; see
`docs/project-brief.md` §9 and §11.2.

Speaker control (`js/speakers.js` + [`/server`](server/README.md)) is built but **currently out of
scope** — it's the one feature that structurally needs a real always-on process on the LAN, and the
current direction is to keep this project to just the deployed URL, no PC or Raspberry Pi to
maintain. `config.js` → `speakers.enabled` stays `false`; see `server/README.md` if that changes.

## Deployment

Push to the connected branch; Cloudflare (Workers with static assets, via `wrangler.toml`) deploys
the repo root as static files — no build command, no server, nothing else to run.
