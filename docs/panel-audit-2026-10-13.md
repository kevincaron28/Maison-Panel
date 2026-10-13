# Maison Panel audit — October 13, 2026

The strongest next step is to make the existing panel easier to read and more dependable. Keep the large clock, temperature, solar theme and compact music controls. Prioritize the agenda, duplicate alerts and recovery behavior before adding more tiles.

## Scope and validation

- Reviewed home, fishing, markets, settings, shared runtime, API handling, caching, reminders, Spotify controls, camera scaffolding and public-asset packaging.
- Inspected the local UI in the browser, including real weather and the signed-in calendar. No personal event details are reproduced here. No music commands, calendar changes or reminder writes were performed.
- Checked home at 1280×800: the forecast content was 400px tall inside a 340px region even before opening seven days; the calendar had only 187px of height in the observed warning state.
- No horizontal page overflow observed on home and settings at 375px, Markets at 375px/800px, or fishing at 800px. This is a sample of layouts, not full accessibility certification.
- All 37 existing tests passed. Reproduced the fishing countdown mismatch in the browser and weather timezone mismatch in Node.
- Live home and Markets returned HTTP 200. The live HTML still contains the mode buttons and economic calendar embed; it does not contain the new compact Markets overview. Recent cleanup is local, not deployed.
- Physical Android/Fully behavior, real speaker controls, cold offline startup and an overnight run were not tested during this audit.

## Assessment

| Dimension | Assessment |
|---|---|
| Visual hierarchy | Strong clock/weather emphasis; agenda and small supporting text need attention. |
| Usability | Useful core functions; redundant navigation, nested scrolling and settings clutter add friction. |
| Correctness | Two reproduced defects, plus time-sensitive information that does not refresh consistently. |
| Reliability/performance | Good request timeouts and cached-weather fallback; startup isolation and offline restart remain incomplete. |
| Security/privacy | Positive: isolated market iframe, public-asset allowlist, private calendar embed. Not a penetration test; historical key revocation remains unverified. |
| Maintainability | Small vanilla modules and meaningful regression coverage; obsolete configuration, duplicated markup and shared entry-point dependencies need cleanup. |

## Confirmed findings, in priority order

### 1. Restore independent startup (high priority)

`js/app.js:2` statically imports alerts; `js/alerts.js:4` statically imports weather. Therefore a missing or unparseable weather module prevents the main entry point from executing, despite the dynamic `loadTile()` error boundaries. `js/details.js:3`–8 similarly imports both page features before its `start()` guards run. This concerns module-load failures, not an ordinary weather API error.

Move optional features behind independent imports and separate pure weather-warning helpers from the UI module. Verify by making one module unavailable and checking that clock, navigation and unrelated tiles still initialize.

### 2. Give the agenda useful space (high product value)

The Google iframe renders a bright, small-text agenda inside the dark theme. In the measured 1280×800 warning state it receives only 187px of height. Warning text and the reminder-management link consume space above it. Its language also differed from the surrounding French interface in this browser session.

First reclaim height by removing duplicated alerts and moving management controls into settings. Longer term, show three to five upcoming events in a native styled agenda, with a full-calendar action. This requires a private, authenticated Calendar integration; changing CSS around the iframe cannot restyle its contents. Google documents read-only event scopes in its [Calendar authorization guide](https://developers.google.com/workspace/calendar/api/auth).

### 3. Make the selected fishing day consistent (confirmed bug)

`js/solunar.js:197` renders the selected day's model, but line 199 passes the combined today/tomorrow periods to the countdown. The periodic countdown at line 238 does the same. Browser reproduction: selecting Demain changes moon percentage and all schedule times, but retains today's upcoming-window countdown.

Use the selected day's periods for the detail countdown. Keep the home active-window indicator based on the current day. Put the selected date next to the day controls. Keep the complete windows visible, as previously requested.

### 4. Use Toronto time consistently (confirmed bug)

The main clock explicitly uses the configured timezone. Weather functions at `js/weather.js:153` and 301 parse zone-less API timestamps with `new Date()`, which uses the device timezone. Solunar day boundaries also use device-local midnight (`js/solunar.js:13`, 218).

Reproduction at the same instant, 2026-10-13T09:30Z, with the same hourly timestamps: Toronto selects 06:00/09:00; UTC selects 12:00/15:00. A tablet with a different timezone can show a correct Toronto clock alongside the wrong forecast hours.

Normalize provider timestamps and calculate day boundaries in the configured timezone. Add a test that runs with the device set outside Toronto. See the provider's timezone/time-format contract in [Open-Meteo documentation](https://open-meteo.com/en/docs).

### 5. Support a dependable offline restart (reliability gap)

Weather payloads are cached, but there is no service-worker registration or explicit offline app-shell cache. A loaded page can retain weather during an outage; opening/restarting the panel offline is not guaranteed to load the HTML and scripts. The daily reload guard already avoids deliberate offline reloads, which is good.

Add versioned caching for owned static assets, a controlled update path and a cold-offline-launch test. Do not cache authenticated Google/Spotify responses. This can be implemented within the static deployment using the [service-worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

### 6. Refresh Markets' upcoming events while the page stays open (medium)

`js/details.js:31` filters by calendar date only and constructs the list once. A morning release remains under À venir after it happens; leaving Markets open overnight retains the previous list. The curated dataset ends on December 31, 2026 (`js/economic-events.js:2`).

Recompute on a timer and on visibility changes, filter timed releases by their actual instant, and distinguish released-today items from upcoming items. Preserve the three-item overview. Give the curated schedule an explicit maintenance/update path before January.

### 7. Show a warning once and preserve family priorities (medium)

The same weather warning appears under current weather and again in the agenda alert list (`js/weather.js:293`, `js/alerts.js:44`). Personal reminders follow weather in a scroll region capped at 100px (`css/calm.css:520`). This repeats information and can push family reminders out of sight.

Keep weather warnings with weather. Keep household reminders with the agenda. Make economic notices optional or confined to Markets. Use one clear stale-data message rather than several competing notices.

### 8. Remove daily-use clutter and internal scrolling (medium)

Weather currently exposes AQI, PM2.5, coordinates, timezone, attribution and a daylight percentage alongside the forecast. Several supporting labels are 13–14px. At 1280×800, the forecast already scrolls before the seven-day view is expanded.

Keep temperature, feels-like, precipitation and wind prominent. Present AQI with a plain-language label, and move technical source/location details into an information disclosure while retaining attribution. Use larger essential labels and expand seven-day weather into a roomy view rather than a small nested scroller. On fishing, bring wind/rain alongside the next window; keep reference explanations farther down.

### 9. Consolidate navigation and settings (medium)

Pêche and Marchés already have direct links, but Explorer repeats them and retains hidden legacy market/fishing markup. There is no app-level idle return to home; a user can leave the wall panel on Markets or settings. Fully may provide a device-level alternative, but its configuration was not inspected.

Use a consistent Accueil / Pêche / Marchés / Réglages navigation. Consider an adjustable idle return on display pages, excluding active forms and music interaction. Move the theme override into settings if automatic appearance is the normal household choice.

Settings has hardcoded dark styling and long developer setup instructions (`settings.html`); it does not participate in solar appearance. Separate everyday preferences and reminders from connection troubleshooting. Add a small diagnostics view showing release version, weather age, storage availability and integration state. Do not call a stored Spotify token proof of a healthy connection.

### 10. Make reminders maintainable (medium/optional integration)

Reminders live only in the current browser and cannot be edited or repeated. Expired entries remain in storage and count toward the 100-entry limit (`js/settings.js:29`). This is a poor fit for recurring collections or bills and can eventually block additions.

Add edit, repeat, and archive-expired actions. If phone-to-panel entry is wanted, choose an authenticated sync mechanism; do not imply local browser storage already syncs with Calendar. Prefer one source of truth instead of asking the family to enter an event twice.

## What to retain

- Solar light/dark behavior and the calm visual palette.
- Large clock and temperature; direct links to fishing and markets.
- The new four-benchmark/three-event Markets overview.
- Spotify token recovery, rate-limit handling, capability-aware controls and stable expanded-control DOM. Real household speaker/group checks remain necessary; this audit did not operate playback.
- Cached weather, bounded network requests and the persisted daily reload guard.
- Complete fishing windows and the explicit distinction between a solunar heuristic and a catch prediction.
- Public deployment allowlisting and market widgets hosted in a separate origin.

## Lower-priority maintenance

- Remove unused `config.night`, clarify unused/default theme settings, and update older architecture notes that contradict the current implementation.
- Render the hourly forecast with night icons after sunset; currently `js/weather.js:332` always passes daytime to the icon renderer.
- Fetch optional air quality without delaying the first weather render (currently awaited after the main forecast, up to five additional seconds).
- If cameras are configured later, stop snapshot polling while hidden and back off on failure. No camera feeds are currently configured, so this is not a present household failure.
- Prior audit records an exposed historical FMP key. Current configuration is empty, but this audit cannot confirm account-side revocation. Verify that once; avoid adding credentials to public configuration.

## Suggested implementation sequence

1. Correct startup isolation, fishing day/countdown and timezone handling; add regression coverage for those behaviors.
2. Remove duplicate warnings/navigation, enlarge agenda and essential labels, and unify settings appearance. Preserve the recent simplifications.
3. Add offline startup, freshness/diagnostics and event-list rollover. Run a physical 24–48 hour tablet check including network loss, sunrise/sunset and the scheduled reload.
4. Decide on the private native agenda and synced recurring reminders. This is the largest product improvement but needs a deliberate integration choice.

The initial audit above was read-only. The implementation record below supersedes its deployment status.

## Implementation record — October 13, 2026

The user authorized all improvements and the private Google/Cloudflare setup. The application has been deployed as Cloudflare version `b180489d-1b1f-46d5-8009-b198a6dfea97`, frontend release `2026.10.13-570d32d1af27`. The preceding code plus new secrets is recoverable at `d6b4276e-8c6d-4cfb-9839-fc5f2ef4a8a8`. No Git commit or push was made in this implementation session.

| Finding | Implementation and evidence |
|---|---|
| 1. Startup | Optional modules load independently. Test deliberately rejects the weather import and confirms clock, agenda and navigation initialize. |
| 2. Agenda | Native themed list, five events, full calendar and Google-view fallback implemented. Owner-only OAuth Worker and encrypted KV deployed. Google Calendar API enabled with approved terms; production OAuth consent completed and five native agenda entries verified live. Anonymous API calls return 401/no-store. |
| 3. Fishing | Selected date and countdown use the selected day's periods. Home indicator remains today-only. Regression test covers tomorrow. |
| 4. Timezone | Provider timestamps and solunar day boundaries use configured Toronto time. Tests include non-Toronto device zones and DST. |
| 5. Offline | Content-hashed shell, controlled update prompt and diagnostics implemented. Simulated network-loss test serves owned assets and excludes private/external requests. Real browser cold-offline and tablet checks remain pending. |
| 6. Economics | Timed release filtering, minute/visibility refresh, expiry notice and maintenance script implemented. Weekly CI check configured locally; it becomes active when the workflow is pushed. Current coverage remains December 31, 2026. |
| 7. Alerts | Weather warnings stay with weather; home alerts show personal reminders; economic releases stay on Markets. |
| 8. Layout | Larger essential labels, technical-source disclosure, seven-day dialog and adjacent fishing weather implemented. Forecast rendering in the moved dialog tested. Live desktop/tablet and phone-width review completed. Fixed the phone navigation overlap found during review; seven-day dialog and tomorrow’s fishing schedule verified. |
| 9. Navigation | Shared four-link navigation, Settings solar theme/override, configurable idle home return and diagnostics implemented. Duplicate Explorer markup removed. |
| 10. Reminders | Add/edit/repeat/archive/restore, active-entry limits and encrypted sync implemented. Tests cover recurrence, tombstone merge, in-flight edit preservation and UI workflow. A temporary reminder was saved and archived live; an encrypted reminder record exists in production KV. Actual phone-to-tablet sync remains a physical-device check. |

Lower-priority fixes implemented: removed obsolete theme/calendar configuration, updated architecture/install docs, night forecast icons, independent air-quality fetch, and camera visibility/backoff. No camera hardware is configured.

Validation: 53 automated tests pass; calendar maintenance check passes with 79 days of coverage; public packaging and Wrangler deployment pass; credential-pattern scan of public assets passes. Local Worker HTTP checks confirm home, index, settings and service-worker responses return 200. Cross-tab logout was verified live: five visible agenda entries became zero immediately. A regression test also rejects an in-flight calendar response after logout. Physical hardware is still untested.

### Remaining account/device work

- Google project and OAuth client are created; owner test user, read-only calendar scope and branding links are saved. API Services User Data Policy accepted with explicit approval. Google APIs Terms of Service and Calendar API terms were explicitly approved and accepted. Calendar API is Enabled and OAuth publishing status is In production. Google displays its unverified personal-app notice; the Worker still accepts only the owner’s verified email.
- Google secrets and the encryption secret are stored in Cloudflare. The temporary local credential file was removed. Live calendar access was verified without saving private events into screenshots or fixtures.
- On explicit user approval, removed the Worker-specific Access application **Maison Panel — Kevin only** (`d7bd2115-f7c6-4866-b3c3-74d626288e00`). Dashboard confirms no Worker-specific protection; public home returns 200. Calendar/reminder endpoints remain Google-owner protected and return 401 without a session. This is a public shell with private data, not a tablet-only site. Global account MFA settings were not changed. Preview URLs remain disabled. No paid plan or billing upgrade was enabled.
- The historical exposed FMP key was tested against its own quote endpoint without printing or copying the key into files. It returned HTTP 200 with a quote, so it is still active. Owner revocation remains necessary; the default TradingView view does not use it.
- Physical tablet/fullscreen, speaker output, actual network loss and 24–48-hour operation were not tested. The user did not have remote-device details available; simple on-device checks are documented in the install guide.

The implementation and live Google/private-API checks are complete. Physical tablet, speaker and extended-operation checks remain pending; the weekly CI workflow is not active until pushed.
