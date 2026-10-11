# Music and connected devices

## Server-free setup now

1. In Google Home on a phone connected to the same Wi-Fi, create a speaker group containing
   the two Google Home/Nest speakers; name it **Maison**.
2. In Spotify, start playback on that group. The panel's Spotify account must be the same account.
3. Open **Commandes** on the panel. **Actualiser** loads devices exposed by Spotify Connect.
   Select the group if available and use **Utiliser cet appareil** to transfer playback.
   Some Cast targets need playback started from the phone before Spotify exposes them to its Web API.
4. Play/pause, previous/next, shuffle, repeat, seeking and volume use the existing Spotify permissions.
   A disabled control means the current device/playback context does not support it.
   The panel controls Spotify playback; it does not stream audio through the tablet.

The panel cannot create Google speaker groups through the Spotify API. Groups are created in Google Home.
Fire TV's Spotify app can be a separate Spotify target; it is not a member of a Google speaker group.
This setup does not promise synchronized playback across Google and Amazon devices.

## Fire TV remote control

The deployed panel is a static HTTPS website with no local bridge. Spotify controls do not grant
TV Home/Back/directional navigation, app launching or general TV volume control.
Home Assistant's Android Debug Bridge integration supports compatible Android/Fire TV devices,
but requires a reachable, running Home Assistant instance, device preparation and pairing.
Fire TV model/OS support must be checked before proposing that installation. No bridge or ADB
configuration has been enabled as part of this release.

## Spotify redirect repair

On October 11, Spotify Developer Dashboard contained the obsolete production callback
`https://maison-panel.kevincaron28.workers.dev/`. It was replaced with
`https://maison-panel.kcaron.workers.dev/`, saved and verified after a reload. The localhost
callback at port 8099 was retained. The user confirmed Fully Kiosk sign-in and playback now work.
The root callback is used even when the panel was opened through `/index.html`.

Do not clear Fully's site storage after signing in. An error about a non-matching redirect URI
is a Spotify app configuration issue, not evidence that Fully's free edition blocks Spotify.

## Suggested next additions

1. A proper family agenda with next-event countdown and a readable weekly view, using authenticated
   calendar access rather than the bright embedded Google interface.
2. Fishing location presets and a pressure/wind/rain trend beside the solunar windows. Keep forecasts
   distinct from fishing guarantees; use real weather data and the selected location's timezone.
3. A shared household checklist for groceries and recurring chores. Multi-device synchronization
   needs authenticated storage; do not present a browser-only list as a shared list.

## References

- [Google speaker groups](https://support.google.com/googlehome/answer/7174267?hl=en)
- [Spotify Connect](https://support.spotify.com/article/spotify-connect/)
- [Spotify on TV](https://support.spotify.com/article/spotify-on-tv/)
- [Spotify playback transfer](https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback)
- [Spotify redirect rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Home Assistant Android Debug Bridge](https://www.home-assistant.io/integrations/androidtv/)
