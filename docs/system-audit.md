# Maison Panel system audit — October 11, 2026

## Release correction after tablet feedback

The first redesign shipped at `9df99de`, but hid fishing behind an extra disclosure and left the
market provider limitation unresolved. The follow-up restores direct navigation, all fishing
details and four visible market benchmarks. TradingView's isolated widget returned prices for
SPY, QQQ, DIA and IWM in browser verification; it is explicitly labeled as ETF tracking and
requires Internet (no offline quote cache). The optional FMP provider is retained.

Spotify's actual registered callback was inspected after user sign-in: it still used the obsolete
workers.dev domain. The correct production root replaced it and persisted after refresh. The
user subsequently confirmed Spotify works on Fully Kiosk. Client code also normalizes callbacks,
retains refresh tokens on configuration/network errors and retries an expired access token once.

Expanded music controls add device selection, volume, seeking, shuffle and repeat with capability
checks. Automated tests exercise request payloads and token recovery; household playback is not
changed during simulated control tests. Remaining physical checks: the new controls on each real
speaker, Google group discovery, an overnight kiosk run and a Wi-Fi interruption on the tablet.
These are not claimed as completed by desktop tests.

## Confirmed cause of the tablet outage

The README and install guide pointed to `maison-panel.kevincaron28.workers.dev`.
That hostname returns NXDOMAIN (Windows DNS and browser both checked). The user independently
reported "URL not resolved" in Fully Kiosk.

Cloudflare's signed-in production overview identifies the real endpoint as
**https://maison-panel.kcaron.workers.dev/**. It serves the dashboard successfully. Production
commit `2e767c80c461de225dff436cba2684ea9370878b` was shown Ready at 100% traffic.
No Cloudflare configuration change is needed to recover the current dashboard: correct the
tablet's Start URL. Tablet confirmation is still required; there is no remote tablet connection.

## Audit scope and evidence

Inspected the repository's runtime modules, configuration, deployment, installation instructions,
UI, cache/timer behavior, authentication handling and externally visible data failures.
Opened the live deployment through Cloudflare's verified link and inspected the browser console.
This is a source/runtime audit, not a penetration test or a physical tablet/OS audit.

## Findings and repairs in the working branch

| Priority | Finding | Repair / remaining action |
|---|---|---|
| P0 | Documented hostname does not resolve | Corrected README/installation URL; user must change Fully Start URL |
| P1 | One failed static module import prevents all startup | Load tiles independently; keep classic startup watchdog and readable retry state |
| P1 | Daily reload executes every minute during the 3am hour | Persist last reload date before navigation, use Toronto date/hour, skip when offline/storage blocked |
| P1 | FMP credential is committed in public repo and publicly served | Remove from current config; device-local setup; owner must revoke old key at FMP (history remains) |
| P1 | Static asset directory is the entire repository | Package an allowlist into dist; docs/tests/previews/dependencies excluded |
| P2 | API requests can hang forever and stall polling | Abort weather, markets and Spotify requests within bounded time |
| P2 | Poller stop does not stop a request from re-arming a timer | Track running/in-flight state; ignore late completion and retain in-memory last-good data |
| P2 | Spotify refresh signs user out on any transient network error | Retain refresh token on transient failures; clear only explicit credential rejection; coalesce refreshes |
| P2 | Spotify podcasts lack artists array; errors stay invisible | Support show metadata and show retry status; guard login errors |
| P2 | FMP error JSON may render NaN; partial results overwrite other quotes | Validate numeric fields; merge cached successes and indicate stale data; respect error backoff |
| P2 | QQQ/DIA/IWM return HTTP 402 in production | Verified provider entitlement failure; changing UI cannot unlock quotes |
| P2 | Rain-shower codes 80–82 classified as snow | Explicit snow-code list; Celsius/Fahrenheit and km/h/mph thresholds corrected |
| P2 | Fishing rating is exactly reversed from its stated heuristic | New/full moon now rates above quarter moon; DST tomorrow calculation uses calendar date increment |
| P2 | Adding camera feeds does nothing | Conditional tile wiring, only shown for configured feeds; HTTPS mismatch explained instead of silent failure |
| P2 | Narrow/short layout clips content; hidden warnings can occupy space | Constrain flex/grid height, enforce hidden, allow small-screen stacking, minimum 48px controls |
| P3 | WOFF2 font files referenced but absent | Use installed fallback fonts; no failing font requests |
| P3 | Calendar lacks iframe title / unsupported modes silently blank | Add title and explicit configuration messages |
| P3 | Offline state is only an unlabeled dot | Add a readable offline status |

The camera module's removal was intentional in prior history until hardware existed. Conditional
wiring preserves an empty-camera home screen while making the documented configuration usable.

## Privacy and architecture

GitHub currently reports the repository as **public**, contrary to older developer notes.
Calendar ID and approximate location are public configuration. Never commit camera credentials,
Home Assistant long-lived tokens, Spotify secrets or replacement FMP keys here.
The Spotify client ID is a public OAuth client identifier, not a secret.
Browser-stored tokens remain accessible to same-origin scripts; this repair does not make a
static browser client a secret store.

The dashboard is a standalone static site, with no Home Assistant connection. It intentionally
does not contain a home server/backend. A native private agenda or home controls require a new
authenticated integration decision; they cannot be produced merely by restyling Google's iframe.

## Design recommendations before commitment

1. **Nuit calme (recommended):** deep green background, soft sage accents, oversized clock/weather,
   agenda and a low music bar. Best fit for a panel kept visible into the evening.
2. **Papier & sauge:** warm off-white and muted green, same hierarchy with a lighter editorial
   appearance. Better fit when a bright screen is preferred in a daylight room.

Both previews put markets/fishing behind Explorer and use clearly marked sample data.
Preview: run `npm run serve`, then open `/design/`. Neither preview is included in deployed assets.
The user selected A / Nuit calme; it is now the default production entry-point design in the working branch. Keep the existing private Calendar iframe for the
first release; the custom agenda in the preview illustrates a later integration, not live events.
The common production-ready layout can also be inspected at `/design/live.html`: real weather,
private Google iframe, Spotify controls, theme switch, 7-day forecast disclosure and Explorer.
The approved layout is now also the production entry point. See layout-research.md for the comparison and refinements.

## Upgrade sequence

1. **Restore now:** set correct Fully URL, verify screen loads, and test Wi-Fi reconnect.
2. **Stabilize:** release tested fixes; revoke exposed key; verify Spotify redirect URI for the real
   domain; keep WebView maintained. Run a 24–48 hour tablet soak including 3am, offline/online, and
   screen sleep/wake before declaring the kiosk reliable.
3. **Redesign:** approve a visual direction; implement the chosen layout with real data and explicit
   empty/stale states. Keep calendar private and preserve practical 48px touch targets.
4. **Offline startup:** add a versioned app-shell service worker with rollback/update handling.
   Cache only owned static files, never Google/Spotify authenticated responses. Test a cold offline
   launch, not just network loss while the page is already open.
5. **Private agenda:** either authenticated Google Calendar access or an existing Home Assistant
   calendar integration. Do not make the household calendar public to get custom styling.
6. **Home Assistant, if desired:** first establish whether an instance exists and how the tablet
   securely reaches it. Start with read-only temperature/room status; add lights/scenes afterward.
   Keep device tokens off the public site/repository. Respect the no-server preference unless changed.
7. **Cameras and tablet operations:** add HTTPS-compatible feeds once hardware is known; consider
   Fully remote administration through a trusted local network/VPN and a controlled maintenance plan.

## Validation and release

Completed: 16/16 regression tests; JS syntax checks; `git diff --check`; public-asset packaging;
and `wrangler deploy --dry-run` (successful, no deployment). Dependency installation reported
zero known vulnerabilities at audit time. Browser checks confirmed live weather, private-calendar
iframe rendering, no startup errors, and no page overflow at 1280×800 or 1280×720. The redesign
also stacks at 800px and 375px widths without horizontal page overflow. Explorer, forecast and
theme controls were exercised. These desktop checks do not emulate Android WebView itself.

For future releases, run `npm ci`, `npm test`, `npm run package`, then syntax checks for owned JS files.
Regression coverage includes warnings/units, moon rating, Toronto/DST reload guard, unavailable
storage, poller shutdown, stalled fetches, FMP error shapes, Spotify transient auth failures,
legacy boot guard and configured-camera rendering.

Remaining manual gates: tablet version and Start URL confirmation, Google calendar session in
Fully, real Spotify login/control, FMP account/key revocation and provider entitlements. A running
desktop preview is not proof those device/account checks pass. Fixes are local until released.

Sources: [Fully documentation](https://www.fully-kiosk.com/en/),
[Cloudflare workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/),
and the inspected repository/live production UI. No user calendar events are copied into previews.
