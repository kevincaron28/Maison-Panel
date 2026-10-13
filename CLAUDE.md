# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## October 2026 audit corrections (take precedence over older notes below)

- The user is now considering an optional local server for synchronized music and Fire TV control,
  with easy migration from a Windows pilot to an old Dell. See `docs/local-server-plan.md`.
  Older absolute no-server constraints below describe the original deployment, not this new proposal.
  No local service has been installed. The October 13 upgrade adds a Cloudflare Worker for private Calendar and reminder sync.

- Production URL: https://maison-panel.kcaron.workers.dev/ (verified in Cloudflare).
- GitHub reports this repository as public. Never commit API keys, camera credentials or device tokens.
- Frontend remains vanilla JS. `worker/index.js` handles authenticated `/api/*` routes with encrypted KV. Google secrets must never reach public assets. Wrangler packages an allowlist into `dist/` before deploying;
  there is no transpilation or bundler. Do not deploy the repository root.
- Node 24+ development checks: `npm ci`, `npm test`, `npm run package`; preview with `npm run serve`.
- Optional camera feeds require HTTPS from the hosted HTTPS panel; no camera appears when feeds are empty.
- FMP setup is per device in `settings.html`. The old exposed key must be revoked by the account owner.
- Markets now defaults to TradingView's separate-origin iframe with four labeled ETF benchmarks;
  FMP is an optional legacy provider. Never load third-party embed scripts in Maison's origin.
- Fishing details must stay visible when its panel opens. Do not reintroduce nested disclosure.
- Spotify callback is the origin root with a trailing slash, never the current pathname.
- `js/music-controls.js` owns the expanded music dialog; controls honor Spotify/device restrictions.
- `docs/system-audit.md` records evidence, limitations and upgrade sequence. `/design/` contains
  sample-data concepts and `/design/live.html` the shared layout with real modules. A / Nuit calme is approved and active in index.html.

## Project overview

**Maison Panel** is a wall-mounted Android tablet dashboard: clock, weather, fishing/solunar timing,
household calendar, and a market-indices strip, in that priority order. Weather and fishing are the
primary use; markets are a secondary strip.

The current architecture uses static frontend assets plus a Cloudflare Worker for private Calendar and reminder sync. There is no home server or Docker requirement. This supersedes the original static-only brief. Spotify remains browser PKCE and controls Spotify Connect devices.

Use Node 24+, `npm test`, `npm run check:calendar`, and `npm run package` before deploying. Check the actual tablet separately; desktop browser testing cannot certify Fully, speaker output or an overnight run.

## Running locally

No build step, so any static file server works, e.g.:

```
npx serve .
# or
python3 -m http.server 8080
```

Opening `index.html` directly via `file://` does **not** work reliably — a `file://` origin breaks CORS
and service workers, so always serve it over `http(s)`.

## Architecture

```
Android tablet / phone
  -> Cloudflare static assets + versioned offline shell
  -> /api/* Worker -> Google Calendar (read-only), encrypted private KV
  -> Open-Meteo (weather), Spotify (PKCE), isolated TradingView widget
```

Operations, privacy and account recovery: `docs/private-integration.md`.


Fishing/solunar times are pure client-side astronomy math (vendored SunCalc) — zero network calls.

## File layout

```
index.html           shell + grid markup for every tile
config.js             the only file Kevin edits day-to-day (location, keys, refresh intervals)
css/panel.css         design tokens (colour, type scale), grid layout, night mode, motion rules
js/
  app.js              orchestrator: wires tiles, runs the refresh scheduler, error boundary
  store.js            localStorage cache + staleness/backoff helper shared by every tile
  clock.js            clock + date tile
  weather.js          Open-Meteo tile (current/hourly/daily)
  solunar.js          fishing/solunar tile (phase 2, built on vendor/suncalc.js)
  calendar.js         Google Calendar tile (phase 3)
  markets.js          FMP (Financial Modeling Prep) markets strip (phase 4) — direct client-side fetch, no server
  spotify.js          Spotify Connect playback control — OAuth PKCE, no server (replaces the removed speaker bridge)
  camera.js           camera snapshot tile — config-driven feeds, tap-to-enlarge (phase 5)
vendor/suncalc.js     vendored SunCalc (MIT/BSD-2-Clause) — not loaded from a CDN
fonts/                self-hosted Archivo + Public Sans (see fonts/README.md)
```

## Key implementation rules (from the brief — do not relax these)

- **Every tile fails independently.** Each fetch is wrapped in its own try/catch; one dead API must
  never blank the rest of the panel.
- **Cache last-good.** Each tile persists its last successful payload to `localStorage` via `store.js`
  and keeps rendering it (dimmed, with a quiet "updated HH:MM" stamp) when a refresh fails.
  A stale reading beats an empty box.
- **Backoff on failure**, reset on success, capped at 30 minutes.
- **Markets only poll 09:30–16:00 ET on weekdays** — outside that window, show the last close and stop
  calling the API.
- **No emoji, no icon fonts.** Weather/moon icons are inline SVG.
- **Type scale has a floor of 18px** — nothing smaller belongs on a panel read from across a room.
- **Solunar amber (`--solunar`) is reserved exclusively** for an active fishing period — it must not
  appear anywhere else on the panel.
- **Markets fetches FMP one symbol at a time, sequentially** (`/stable/quote`, not `/stable/batch-quote`
  — that endpoint is paid-plan-only and returns "Restricted Endpoint" on the free tier this project
  uses). Firing all requests in parallel previously left only one symbol rendering, likely a
  free-tier burst/concurrency limit — sequential avoids it and costs nothing meaningful for a tile
  refreshed every 15 minutes.
- Repo stays **private**: camera URLs/credentials belong only in `config.js`, never committed
  elsewhere.

## Visual design — supersedes brief §8 on one point

`docs/project-brief.md` §8 explicitly rejects a card-based look ("every tile in an identical
rounded box... flattens hierarchy"). That's no longer the direction: at Kevin's request, the panel
now follows a broader improvement plan (audited and being worked through in small phases — camera,
touch targets, markets robustness, and this) that calls for a "premium smart-home panel" look —
cards with a subtle border and consistent radius, consistent spacing, restrained (no heavy shadow).
Every top-level tile (`#tile-weather`, `#tile-calendar`, `#tile-solunar`, `#tile-markets`,
`#tile-spotify`, `#tile-cameras`) shares that treatment in `css/panel.css`. Everything else from §8 still holds:
large numbers for primary readouts, small muted secondary text, no shadow beyond the card border
itself, solunar amber still reserved exclusively for an active period, type floor still 18px for
anything meant to be read as a primary value (secondary/status labels like `.market-label` sit a
bit under that, matching existing precedent).

## Build order

Phase 1 (shell, grid, tokens, clock, weather) ships first and should always be deployable/visible on
its own before later phases add solunar, calendar, markets, and camera tiles. See `docs/project-brief.md`
§9 for the full phase table and §11 for open questions (tablet model, camera brand, locale, calendar
visibility, exact coordinates) that block phases 3+.

Google Home speaker control was added after the original brief, at Kevin's request, then removed
(September 2026, see above) in favor of keeping the project a pure static site with no second
machine, and replaced with Spotify Connect (`js/spotify.js`) — same media-control goal, no server
needed. Neither was ever part of the `docs/project-brief.md` phase table.
