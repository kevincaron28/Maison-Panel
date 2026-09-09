# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Maison Panel** is a wall-mounted Android tablet dashboard: clock, weather, fishing/solunar timing,
household calendar, and a market-indices strip, in that priority order. Weather and fishing are the
primary use; markets are a secondary strip.

**The constraint that drives every decision:** no home server, no Docker, no backend. It is a static
site — plain HTML/CSS/vanilla JS modules, no framework, no build step, no bundler — deployed to
Cloudflare Pages. The tablet's browser calls every external API directly; there is no middleware layer.
See `docs/project-brief.md` for the full brief this build follows (architecture rationale, tile specs,
resilience requirements, design direction, and the phased build order).

**`/server` exists but is currently out of scope.** It's a small local Node process (the "speaker
bridge") that discovers and controls Google Home / Chromecast speakers over the LAN — a browser
genuinely cannot do Cast-protocol device discovery itself, there's no API for it. It's the one
feature that would need a real always-on process on a PC or Raspberry Pi, which is exactly what
Kevin decided (September 2026) to avoid: the project stays a pure static site with no second
machine to run or maintain. The code is left in the repo (`js/speakers.js`, `server/`) but
`config.js` → `speakers.enabled` stays `false` and nothing wires it in. See `server/README.md`.
Markets does **not** use `/server` — it fetches FMP directly from the browser (see below). Nothing
else in this repo gets a server exception — every tile is client-side-only against a public API or
local math.

There are no lint, build, or test commands. Changes are validated by opening `index.html` (a local
static server is enough — see below) and, ultimately, by the deployed Pages URL on the actual tablet.

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
[Android tablet, Fully Kiosk Browser]
        │ loads https://<name>.workers.dev
        ▼
[Cloudflare Workers, static assets] ← static HTML/CSS/JS only, deployed via wrangler.toml from git
        │ the browser fetches directly:
        ├──► api.open-meteo.com          (weather, no key, CORS: *)
        ├──► financialmodelingprep.com   (markets, key in query string, CORS enabled)
        ├──► googleapis.com/calendar     (calendar, browser API key)
        └──► http://<camera-lan-ip>      (camera snapshots, LAN only, phase 5)

  (speaker control — js/speakers.js + /server — exists in the repo but is currently out of scope;
   see server/README.md. Not part of the deployed panel.)
```

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
  camera.js           camera snapshot tile — config-driven feeds, tap-to-enlarge (phase 5)
  speakers.js         Google Home / Chromecast speaker tile — talks to /server; currently unused, speakers.enabled: false
vendor/suncalc.js     vendored SunCalc (MIT/BSD-2-Clause) — not loaded from a CDN
fonts/                self-hosted Archivo + Public Sans (see fonts/README.md)
server/               speaker bridge — currently out of scope, not part of the deployed panel (see server/README.md)
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
`#tile-speakers`, `#tile-cameras`) shares that treatment in `css/panel.css`. Everything else from
§8 still holds: large numbers for primary readouts, small muted secondary text, no shadow beyond
the card border itself, solunar amber still reserved exclusively for an active period, type floor
still 18px for anything meant to be read as a primary value (secondary/status labels like
`.market-label` or `.speaker-status` sit a bit under that, matching existing precedent).

## Build order

Phase 1 (shell, grid, tokens, clock, weather) ships first and should always be deployable/visible on
its own before later phases add solunar, calendar, markets, and camera tiles. See `docs/project-brief.md`
§9 for the full phase table and §11 for open questions (tablet model, camera brand, locale, calendar
visibility, exact coordinates) that block phases 3+.

Speaker control (`js/speakers.js` + `/server`) was added after the original brief, at Kevin's
request, then put on hold (September 2026, see above) in favor of keeping the project a pure
static site with no second machine. It isn't in the `docs/project-brief.md` phase table, and its
code is documented in `server/README.md` rather than the brief.
