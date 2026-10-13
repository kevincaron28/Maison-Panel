# Maison: fixes and next priorities

October 12, 2026 release. Physical tablet/speaker checks remain.

October 13: removed the Bonjour, Absent and Bonne nuit presets. Light/dark appearance follows local solar
times by default, with optional manual overrides. Weather visuals and active solunar highlights
are implemented. They are static accents; the strongest fishing highlight requires an active
major period rated at least 3/4. No promise of catches or safe boating conditions is implied.

## This update

- User confirmed Sherrington. Keep 45.167, -73.517, Celsius and America/Toronto.
  The home screen now names Sherrington and displays the weather model timestamp,
  units and coordinates. Open-Meteo is an estimate, not a thermometer at the house.
  Weather cache keys include coordinates, timezone and units to prevent cross-location data.
- Pêche and Marchés now show separate focused views. Explorer opens a menu, with
  direct switching between sections and focus restored to the original opener on close.
- Spotify waits through API Retry-After rate limits, backs off after polling failures,
  polls less often while paused/hidden, clears obsolete device/track details on idle,
  disables stale controls after failed playback reads, and requests reconnection after
  a second rejected access token. Signed-out sessions cannot transfer playback.

## Verification and remaining work

Automated tests cover navigation isolation, cache identity, play/pause, previous/next,
volume, seeking, shuffle, repeat, device transfer, capability restrictions, retained slider
focus, idle state, token refresh and rate limiting. Requests use mocked Spotify responses:
they prove wiring and failure handling, not that a physical speaker accepted a command.

Before calling the system finished:

1. Verify the deployed runtime on the existing Cloudflare site after each release.
2. On the signed-in tablet, test each Spotify control on the real active device; repeat
   after a speaker sleeps/wakes and after an Internet interruption. Check volume support
   per device. Launch Spotify on a phone/speaker if no device is available.
3. Verify fullscreen layout, touch targets, private Google Calendar login, overnight
   recovery and the daily reload on the YESTEL tablet.
4. Pair and test the proposed Google-speaker/Bluetooth-soundbar route physically.
   Grouping is outside the Spotify Web API controls in this panel.
5. Camera feeds and any Home Assistant server integration remain unconfigured.

## Recommended order

**First: daily household usefulness.** Add a concise next-event summary, shared shopping
list, recurring chores, garbage/recycling reminders and an obvious service-health indicator.
Shared editable lists need authenticated storage; browser-only local storage will not
synchronize between family devices. Keep the private calendar private.

**Second: a small home-control pilot using existing equipment.** If automation is wanted,
try Home Assistant OS in a VM on the existing Windows PC, after checking virtualization
and networking. Start with one room, supported lights/plugs and Good morning / Away /
Good night scenes. Back up the installation before later migration to the Dell.
Do not put long-lived Home Assistant credentials in this public repository.

**Third: useful sensors.** Indoor temperature/humidity, leak detection and open-door
status are good candidates. Add an outdoor sensor if the goal is temperature at the house
rather than a regional model estimate. Select devices only after compatibility is checked.

**Later: cameras and TV.** Add an entry-camera view when hardware is known. Evaluate Fire TV
control against its exact model and firmware; Android TV Remote does not support Fire TV.
Avoid promising synchronized audio across unlike devices before listening tests.

Design rule: keep the home screen calm; put detailed controls into dedicated sections.

## Sources checked

- [Québec official Sherrington coordinates](https://toponymie.gouv.qc.ca/ct/ToposWeb/Fiche.aspx?no_seq=57382)
- [Open-Meteo model-based current conditions](https://open-meteo.com/en/docs)
- [Spotify rate limits and Retry-After](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
- [Home Assistant on Windows](https://www.home-assistant.io/installation/windows/)
- [Home Assistant backups](https://www.home-assistant.io/common-tasks/general/)
- [Google speaker Bluetooth output and groups](https://support.google.com/googlehome/answer/7672356?hl=en)
- [Android TV Remote limitations](https://www.home-assistant.io/integrations/androidtv_remote/)
