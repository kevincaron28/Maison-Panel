# Maison Panel

A wall-mounted Android tablet dashboard — clock, weather, fishing/solunar timing, household calendar,
and a market-indices strip. Read from across a hallway, always on.

Full design rationale, tile specs, and build order: [`docs/project-brief.md`](docs/project-brief.md).
Repo-specific dev notes: [`CLAUDE.md`](CLAUDE.md). Getting this onto an actual tablet:
[`docs/install-guide.md`](docs/install-guide.md).

## Stack

Plain HTML, CSS and vanilla JavaScript, with a small Cloudflare Worker for private Google Calendar access and reminder synchronization. No home server is required. Weather and Spotify still connect directly from the browser; Markets uses an isolated TradingView iframe. Fishing calculations run locally using SunCalc.

Google credentials live in Cloudflare secrets. Private tokens and synced reminders are encrypted in KV. The Worker accepts only the configured owner Google account; calendar access is read-only. See [private integration operations](docs/private-integration.md).

## Running locally

```
npm run serve
```

The static preview covers UI and public integrations. Use `npx wrangler dev` for the packaged Worker and offline shell. Production Google sign-in requires the registered HTTPS callback; local preview does not use production credentials.

## YESTEL T13 display target

The panel is optimized for the common YESTEL T13 configuration: a 10.1-inch display at
1280 × 800 pixels in landscape orientation. Android browser and navigation chrome can reduce the
usable CSS viewport below 800 pixels, so `css/calm.css` includes a compact landscape profile.
The home screen fits the tablet; detail panels scroll when needed and retain an accessible close control.

The exact physical casing dimensions and browser viewport can vary by hardware revision and kiosk
settings. Validate the deployed panel with the tablet in landscape, fullscreen mode, and with
Android navigation controls hidden before changing the T13 breakpoint.

## Configuration

The default interface follows **Sherrington sunrise/sunset**: light by day, dark at night,
calculated locally without requiring weather connectivity. The theme button in Settings cycles Auto / Light /
Dark and remembers that choice. Weather adds subtle static rain, wind, snow, cloud or clear-sky
accents; cached weather uses a neutral appearance. Active fishing periods show an amber indicator,
with a stronger accent for major periods rated at least 3/4 (solunar indication, not a catch guarantee).

The panel follows sunrise and sunset without Away/Sleep presets or automatic music commands.
`config.js` → `ui` controls the compact hourly forecast.
See [layout research](docs/layout-research.md) for the design
comparison and original rationale. The native private agenda now replaces the embedded default.

Public preferences — location, units, refresh intervals, market symbols and camera feeds —
lives in [`config.js`](config.js). That's the only file meant to be hand-edited day to day.

## Status

Dedicated pages: **[Markets](markets.html)** includes ETF charts, economic calendar, selected
official economic-release reminders, trading hours and Canadian-market resources.
**[Fishing](fishing.html)** includes today/tomorrow solunar windows, seven-day weather, a daily
device-local trip checklist and official Québec zone/permit links.

Home shows personal reminders alongside the agenda; weather warnings stay with weather and economic releases stay on Markets. Reminders can be edited, repeated daily/weekly/monthly, archived and restored in Settings. Sign into the same approved Google account on a phone and the panel to sync reminders. Offline edits remain local until the next successful sync. These are on-panel reminders, not phone push notifications.

The curated economic schedule currently covers dates through December 31, 2026. `npm run check:calendar` validates it and fails within 30 days of expiry. See [schedule maintenance](docs/economic-calendar-maintenance.md). Upcoming releases refresh every minute and on returning to the page.

The versioned offline shell keeps owned pages/scripts/fonts available after one online installation. Google and Spotify responses are never cached by the service worker. Cached weather is marked as stale. Updates appear as an explicit “Mise à jour prête” action; Settings shows the installed release and connection diagnostics.

The existing production dashboard is hosted at
[`maison-panel.kcaron.workers.dev`](https://maison-panel.kcaron.workers.dev):

- **Markets** shows all four ETF benchmarks (SPY, QQQ, DIA, IWM) through TradingView without an API key.
  These are ETF share prices in USD, not index levels. The widget labels its quote delays and
  market status. It runs in a separate-origin iframe, away from Spotify/device storage.
  It requires Internet access and cannot use Maison's local last-good quote cache.
  The optional FMP provider remains available via `config.js`; its subscription must cover all symbols.
  The historical exposed FMP key was checked October 13 and still returned a valid quote; the owner must revoke it. It is not used by the default Markets view.
- **Fishing** is accessible directly from the home navigation and shows complete major/minor
  windows, peaks, moon phase/rating, sunrise/sunset and today/tomorrow schedules. The solunar
  rating is an indication from traditional solunar theory, not a catch forecast.
- **Calendar** shows up to five upcoming private events in the panel's theme. Connect once in Settings; the full Google calendar and an embedded fallback remain available. Google's embedded-browser policies may require Chrome instead of Fully for account sign-in; verify on the actual tablet.

Camera (`js/camera.js`) connects the HM203 through an owner-authenticated image relay.
The PC bridge converts RTSP into refreshing images while Caméras is open; the PC and
Ethernet-connected camera must stay on. Windows automatic startup is not installed
(approval review blocked it). See `docs/camera-integration.md` for operation and manual startup.

**Spotify** (`js/spotify.js`) controls playback on whichever device is active in Kevin's Spotify
account — a phone, a computer, or a Spotify Connect–enabled speaker — via the Spotify Web API.
`config.js` → `spotify.clientId` is set; the one remaining step is a one-time login tap on the
tablet itself (see `docs/install-guide.md`). The user confirmed that tablet sign-in works after
the October 11 redirect correction. **Commandes** opens device selection, volume, seeking,
shuffle and repeat. Unavailable device capabilities are disabled. Leave `clientId` blank to hide the tile.

Music grouping and Fire TV limitations: [music and device guide](docs/music-and-devices.md).

## Deployment

Cloudflare deploys `main` using `npx wrangler deploy`. Wrangler first runs
`node scripts/package.mjs`, which copies only runtime assets into `dist/`. This packaging step
does not compile JavaScript; it prevents docs, tests, design previews and dependencies from being
published as website files.

Before release: `npm ci`, `npm test`, `npm run check:calendar`, `npm run package`. A local design comparison is available at
`http://127.0.0.1:8080/design/` while the preview server runs. Design previews use sample data.

See [the audit and upgrade plan](docs/system-audit.md) for confirmed findings, remaining account
and tablet checks, and rollout steps. Local fixes are not deployed until their branch is released.
