# Local bridge (speaker control) — currently out of scope

A small local Node service, meant to run on a PC or Raspberry Pi, that discovers and controls
Google Home / Chromecast-enabled speakers on the LAN and exposes them as plain HTTP for the
tablet's browser to call.

**Status: not part of the current build.** Kevin's decision, September 2026: keep Maison Panel to
just the deployed URL, with no second machine to babysit. Every other tile is already pure
client-side (static HTML/CSS/JS calling public APIs directly); speaker control is the one feature
that structurally cannot work that way — a browser cannot do Cast-protocol device discovery
(mDNS) or hold the raw socket connection a Cast session needs, so it needs a real always-on
process somewhere on the LAN. That requirement is exactly what's being avoided right now, so this
code stays in the repo, unused, rather than wired in. `js/speakers.js` and `config.js` →
`speakers.enabled` are both still present and both still default to off.

If speaker control is wanted again later, this is a working starting point — see **Known
limitation** below for what to verify against real hardware before trusting it. Markets does
**not** route through here; it fetches Financial Modeling Prep directly from the browser (see
`js/markets.js`) and has no server dependency at all.

## Setup

Requires Node.js 18+, running on a machine on the **same LAN/Wi-Fi** as the speakers (and the
tablet).

```
cd server
npm install
npm start
```

You should see something like:

```
[speaker-bridge] listening on http://0.0.0.0:8787
[speaker-bridge] waiting for Cast devices to announce themselves...
[speaker-bridge] discovered "Living Room speaker" (192.168.1.42) as "living-room-speaker"
```

Devices can take a few seconds to announce themselves after startup — that's normal. If nothing
shows up after ~30 seconds, see **Troubleshooting** below.

Verify it's working before touching the panel at all:

```
curl http://localhost:8787/api/health
curl http://localhost:8787/api/speakers
```

## Wiring it into the panel

1. Find this machine's LAN IP address (not `localhost` — the tablet needs to reach it over
   Wi-Fi): `ipconfig` on Windows, `ip addr` or `hostname -I` on Linux/Raspberry Pi OS.
2. In the repo's `config.js`:
   ```js
   speakers: {
     enabled: true,
     bridgeUrl: "http://192.168.1.50:8787", // this machine's IP and the port above
     refresh: 10 * 1000,
   },
   ```
3. Push that change — Cloudflare redeploys the panel automatically.
4. **On the tablet**, in Fully Kiosk Browser: enable **"Allow insecure content" / "Enable Mixed
   Content"** (exact name varies by version, under Web Content Settings). The panel is served over
   `https://`, but this bridge is plain `http://` on the LAN — browsers block that combination by
   default, same as the camera tile in the brief. This is a one-time setting, not a code fix.

## Keeping it running

Just leave the terminal window open on the PC (or run `npm start` again after a reboot). On a
Raspberry Pi, run it as a real background service so it survives reboots — e.g. a systemd unit:

```ini
# /etc/systemd/system/maison-bridge.service
[Unit]
Description=Maison Panel speaker bridge
After=network-online.target

[Service]
WorkingDirectory=/home/pi/Maison-Panel/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
User=pi

[Install]
WantedBy=multi-user.target
```

Then `sudo systemctl enable --now maison-bridge`.

## API

All responses are JSON. No auth — this is a LAN-only tool with nothing secret in play.

| Endpoint | Method | Body | Does |
|---|---|---|---|
| `/api/health` | GET | — | `{ ok, speakerCount }` — is the bridge alive |
| `/api/speakers` | GET | — | list of known speakers with status |
| `/api/speakers/:id/pause` | POST | — | pause |
| `/api/speakers/:id/resume` | POST | — | resume/unpause |
| `/api/speakers/:id/stop` | POST | — | stop |
| `/api/speakers/:id/volume` | POST | `{ "level": 0.0-1.0 }` | set volume |

A speaker's `:id` is a slug of its name (e.g. "Living Room speaker" → `living-room-speaker`) —
check `/api/speakers` to see the exact ids for your devices.

## Known limitation — please verify against your real speakers

This was built and tested for correctness against the `chromecast-api` library's own source and a
live HTTP smoke test, but **not against real Google Home hardware** — there wasn't any reachable
from where this was built. Two things worth knowing once you do test it:

- **Status** (`/api/speakers`) reads the Cast receiver's status, which works no matter what started
  playback — a voice command, Spotify, YouTube Music, or this bridge itself.
- **Transport controls** (pause/resume/stop) only work for a session this bridge can actually join.
  In practice that reliably means content it casts itself, or the built-in YouTube/default-receiver
  apps. A session a third-party app started under its *own* Cast receiver (Spotify's, for instance)
  may show up fine in status but not respond to pause/resume — that's a Cast protocol boundary, not
  a bug to file here. Volume control is receiver-level and should work regardless.

If that limitation turns out to matter for how you actually use these speakers, say so and this can
be revisited — there are lower-level ways to influence third-party sessions, they're just more
involved than this first pass.

## Troubleshooting

- **No devices found**: confirm this machine and the speakers are on the same Wi-Fi network/subnet
  (a "guest" network or an isolated IoT VLAN will hide them). Some routers block the mDNS multicast
  traffic discovery needs between subnets — same-subnet Wi-Fi is the easy case.
- **Panel shows nothing / console says failed to fetch**: check the mixed-content setting above,
  and confirm `bridgeUrl` in `config.js` matches this machine's *current* LAN IP (it can change on
  reboot unless you reserve it in your router's DHCP settings — worth doing once this is permanent).
