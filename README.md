# Maison Panel

A wall-mounted Android tablet dashboard — clock, weather, fishing/solunar timing, household calendar,
and a market-indices strip. Read from across a hallway, always on.

Full design rationale, tile specs, and build order: [`docs/project-brief.md`](docs/project-brief.md).
Repo-specific dev notes: [`CLAUDE.md`](CLAUDE.md). Getting this onto an actual tablet:
[`docs/install-guide.md`](docs/install-guide.md).

## Stack

Plain HTML + CSS + vanilla JS modules. No framework, no transpilation, no bundler, no server. Deployed
as a static site (Cloudflare Workers with static assets); the tablet's browser calls every API
directly (Open-Meteo, FMP, Google Calendar). Solunar/fishing timing is local astronomy math via a
vendored copy of [SunCalc](https://github.com/mourner/suncalc) — no network call for that tile.

No server, no second machine, no LAN process of any kind — every tile is client-side-only against
a public API or local math. Music control talks to Spotify Connect (the Spotify Web API), auth'd
with OAuth Authorization Code + PKCE, which — unlike the Google Home speaker bridge this project
used to have — is a cloud API call the browser can make directly, no local process required.

## Running locally

```
npm run serve
```

(Any static file server works. Do not open `index.html` via `file://` — that origin breaks CORS.)

## YESTEL T13 display target

The panel is optimized for the common YESTEL T13 configuration: a 10.1-inch display at
1280 × 800 pixels in landscape orientation. Android browser and navigation chrome can reduce the
usable CSS viewport below 800 pixels, so `css/panel.css` includes a compact T13 profile for
viewports up to 1280 × 850 and keeps the page itself non-scrolling.

The exact physical casing dimensions and browser viewport can vary by hardware revision and kiosk
settings. Validate the deployed panel with the tablet in landscape, fullscreen mode, and with
Android navigation controls hidden before changing the T13 breakpoint.

## Configuration

The default interface is **Nuit calme**, with the welcome **Bienvenue, famille Caron.**
`config.js` → `ui` controls the default theme and compact hourly forecast. A previously selected
theme is remembered per browser. See [layout research](docs/layout-research.md) for the design
comparison, rationale and remaining private-agenda limitation.

Everything you'd tune — location, units, refresh intervals, API keys, market symbols, camera feeds —
lives in [`config.js`](config.js). That's the only file meant to be hand-edited day to day.

## Status

The existing production dashboard is hosted at
[`maison-panel.kcaron.workers.dev`](https://maison-panel.kcaron.workers.dev):

- **Markets** uses Financial Modeling Prep. Set a replacement key per tablet via **Réglages**;
  the previously committed key must be revoked at FMP. Keys entered here stay out of Git, but are
  still browser credentials and are sent to FMP. During the October 11 audit, QQQ, DIA and IWM
  returned HTTP 402; SPY returned a quote. A code change cannot unlock provider entitlements.
  The free
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

**Spotify** (`js/spotify.js`) controls playback on whichever device is active in Kevin's Spotify
account — a phone, a computer, or a Spotify Connect–enabled speaker — via the Spotify Web API.
`config.js` → `spotify.clientId` is set; the one remaining step is a one-time login tap on the
tablet itself (see `docs/install-guide.md`). Leave `clientId` blank to hide the tile entirely.

## Deployment

Cloudflare deploys `main` using `npx wrangler deploy`. Wrangler first runs
`node scripts/package.mjs`, which copies only runtime assets into `dist/`. This packaging step
does not compile JavaScript; it prevents docs, tests, design previews and dependencies from being
published as website files.

Before release: `npm ci`, `npm test`, `npm run package`. A local design comparison is available at
`http://127.0.0.1:8080/design/` while the preview server runs. Design previews use sample data.

See [the audit and upgrade plan](docs/system-audit.md) for confirmed findings, remaining account
and tablet checks, and rollout steps. Local fixes are not deployed until their branch is released.
