# Installing Maison Panel — the plain-English guide

This walks through everything needed to go from "code on GitHub" to "dashboard glowing on the
wall." No coding required for this part — Phases 1 (weather) and 2 (solunar) work with zero API
keys, so you can get the panel live today.

There are two parts:

1. **Put the website online** (done once, from any computer) — 10 minutes.
2. **Set up the tablet** (done once, on the tablet itself) — 15 minutes.

---

## Part 1 — Put the website online (Cloudflare Workers)

Think of this step as: "take the code and give it a real web address." Right now the code just
sits in GitHub; it isn't a website yet. This project uses Cloudflare's **Workers** static-assets flow — it reads the code and turns it into
`https://something.workers.dev` that the tablet can open.

1. Go to **[dash.cloudflare.com](https://dash.cloudflare.com)** and log in (Kevin already has an
   account from `cpt-ai.pages.dev`).
2. In the left sidebar, click **Workers & Pages**.
3. Click **Create** → **Connect to Git**.
4. If GitHub isn't connected yet, click **Connect GitHub** and approve it. Make sure Cloudflare
   has access to `kevincaron28/Maison-Panel` specifically
   (either "all repositories" or pick it from the list).
5. Select the **Maison-Panel** repository, then click **Begin setup**.
6. Pick the branch to deploy — **`main`**, the branch that should always be live on the wall.
7. Build settings — this project has **no build step**, but Cloudflare's Workers flow still asks
   for two fields:
   - **Build command**: leave **blank**
   - **Deploy command**: `npx wrangler deploy` — `wrangler.toml` packages public runtime assets
     into `dist/` and serves that directory, with no Worker script needed
8. Click **Deploy**. Wait about 30–60 seconds.
9. Cloudflare gives you a URL like `https://maison-panel.kcaron.workers.dev`. **Write this
   URL down** — the tablet needs it in Part 2. On the project's **Domains** tab, make sure the
   **Production** toggle next to that URL is switched **on** — that's what actually makes it public.
10. Open that URL in any browser (your phone, your laptop). You should see: a clock, today's
    weather, and a moon phase under "Pêche." That means it worked.

From now on, any time new code is pushed to the `main` branch, Cloudflare automatically rebuilds
and updates that same URL within about a minute — no redeploying by hand.

---

## Part 2 — Set up the tablet

This part turns a normal Android tablet into a wall panel that only ever shows this one page,
never sleeps, and never lets anyone accidentally swipe away from it.

### 2.1 Install the kiosk app

1. On the tablet, open the **Play Store**.
2. Search for **Fully Kiosk Browser** and install it (free version is enough to start).
3. Open the app once it's installed.

### 2.2 Point it at your panel

1. In Fully Kiosk Browser, open **Settings** (usually a long-press on the screen, or the menu
   icon) → **Web Content Settings** → **Start URL**.
2. Paste in the `workers.dev` URL from Part 1.
3. Go back to the main screen — it should now load the panel.

### 2.3 Make it behave like a real wall panel, not a browser

Still inside Fully Kiosk Browser's settings, turn these on (names may vary slightly by version):

| Setting | Where | Why |
|---|---|---|
| **Fullscreen / Kiosk mode** | Motion & Kiosk Mode | hides the Android status bar and nav buttons |
| **Enable Start URL on boot** | General | panel comes back automatically after a power cut |
| **Screen always on** | Device Management | tablet never goes to sleep |
| **Disable pull-to-refresh** | Web Content Settings | stops an accidental swipe from reloading the page |
| **Disable long-press context menu** | Web Content Settings | stops an accidental long-press popping up a menu |
| **Motion-detect screen wake** *(if tablet has a front camera)* | Motion & Kiosk Mode | wakes the screen when someone walks by |

If the app asks to become a **Device Admin** or a **Home/Launcher app**, say yes — that's what
lets it block the regular Android home button and stay in full kiosk mode.

### 2.4 Tablet-wide settings (in Android's own Settings app, not Fully Kiosk)

1. **Display → Auto-rotate**: turn off, and lock to **landscape**.
2. Keep **Android System WebView** and Chrome current. Fully uses the installed WebView engine;
   schedule and verify kiosk-app updates during maintenance rather than disabling all updates.
3. **Notifications**: turn off notifications for every app you can — a message popup on the wall
   panel looks broken even if it isn't.
4. **Battery**: if the tablet has a "charge limit" option (some Samsung/Lenovo tablets do), set it
   to around **80%**. A tablet charging at 100% forever, permanently plugged in, wears the battery
   out in a year or two. If there's no such setting, just budget for eventually replacing the
   battery — it's a consumable in this setup, not a defect.

### 2.5 Mount it

1. Plan the power cable route **before** you drill anything — this is much harder to fix after the
   tablet is on the wall.
2. Mount the tablet in **landscape** orientation.
3. Plug it in, and leave it plugged in permanently (that's what the 80% charge limit above is
   protecting against).

That's it — the panel should now be live on the wall, updating the clock every few seconds,
weather every 15 minutes, and the moon/fishing info every 5 minutes, entirely on its own.

---

## Checking it's working

- **Weather looks wrong / blank**: it'll say "updated HH:MM" in a dimmed color if it's showing an
  old cached reading because the live fetch failed — that's expected behavior, not a bug (see
  `CLAUDE.md` — every tile is designed to degrade gracefully rather than go blank).
- **Whole panel is blank/white**: that means the page itself didn't load — double check the Start
  URL in Fully Kiosk Browser matches the `workers.dev` address exactly.
- **Panel looks right but is stuck on an old version**: on the tablet, in Fully Kiosk Browser,
  there's a manual **Reload Start URL** action in the settings/menu — or just wait, since the
  panel auto-reloads itself once a day at 3am anyway (`config.js` → `dailyReloadHour`).

## Turning on calendar and markets

Weather and solunar work with zero setup. Calendar and markets are both configured now too — here's
what each still needs from the tablet side to actually show anything.

**Calendar** — open Settings and choose **Connecter Google** using the approved owner account. The native agenda remains private; do not make the calendar public. Sign in on both the phone and tablet to synchronize reminders. Google can restrict sign-in in embedded WebViews; use a supported browser on the tablet if Fully is blocked. A Google browser session alone does not establish a Maison Panel session.

**Markets** — four ETF benchmarks now use TradingView without a key or paid FMP plan. The historical exposed FMP key still worked during the October 13 check and should be revoked by its owner. Do not enter that old key in Settings.

**Updates/offline** — load once online and check Settings → diagnostics for an active offline cache. Tap **Mise à jour prête · appliquer** when offered. Disconnect Wi-Fi, close and reopen the page, and verify the clock, navigation and cached weather. Reconnect and verify fresh weather and agenda. A first-ever offline visit cannot install the cache.

**Final tablet check** — landscape/fullscreen; open and close the seven-day forecast; switch fishing to tomorrow; test one safe speaker at low volume; leave running overnight across the 03:00 reload and sunrise. Record actual results instead of assuming desktop tests cover the device.

## Camera — not yet

Camera hardware hasn't been bought yet, so there's nothing to configure — `config.js` →
`camera.feeds` stays empty until it is. Configured feeds enable the hidden camera section. See `docs/project-brief.md` §11.2 for what's needed
once a camera's picked (brand/model decides whether snapshot polling is even possible).

## Music — one-time login on the tablet

`config.js` → `spotify.clientId` is already set. Spotify still needs the panel's exact URL logged
in once, in the tablet's own browser session, before the tile can control anything:

1. On the tablet, open the panel and tap **"Connecter Spotify"** in the Musique tile.
2. It redirects to Spotify's normal login/consent screen — sign in with the Premium account and
   approve access.
3. It redirects straight back to the panel, now showing whatever's currently playing.

That login is stored in the tablet's browser (`localStorage`) and refreshes itself silently after
that — no need to repeat this unless the tablet's browser data gets cleared. The tile controls
whichever device is currently active in that Spotify account (a phone, a computer, or a Spotify
Connect–enabled speaker) — it doesn't play audio through the tablet itself, it just sends
play/pause/skip/volume commands to whatever's already playing somewhere else.

If "Connecter Spotify" redirects to an error page instead of the login screen, the most likely
cause is the redirect URI registered on the Spotify Developer Dashboard not exactly matching this
panel's URL (including the trailing slash) — check that on
[developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → the app → Settings.

## Changing settings later (location, units, etc.)

Everything tunable lives in one file: **`config.js`**, at the root of the repo. To change
something (say, the exact coordinates, or Celsius→Fahrenheit):

1. Edit `config.js` on GitHub (or locally, then `git push`).
2. Push it to the `main` branch.
3. Cloudflare redeploys automatically within about a minute.
4. The tablet picks it up the next time it reloads (at most, by the next 3am auto-reload).

No app store, no manual install, no touching the tablet at all.

## Recovery: "URL not resolved"

The confirmed production address on October 11, 2026 is
**https://maison-panel.kcaron.workers.dev/**. The old documentation incorrectly used
`maison-panel.kevincaron28.workers.dev`; that address does not resolve.

1. Set Fully's Start URL to the confirmed address above and use Reload Start URL.
2. Test the same address in Chrome on the tablet. If both fail, check Wi-Fi/DNS and confirm the
   address in Cloudflare → Workers & Pages → maison-panel → Domains.
3. If Chrome works but Fully does not, update Android System WebView and Fully, ensure JavaScript
   is enabled, and inspect Fully's page-load error. Do not disable TLS verification.
4. Keep cookies and web storage across reloads so calendar/Spotify authentication can persist.
5. Configure Reload on Page Error / network reconnect according to your Fully version, then test
   a Wi-Fi interruption. A DNS failure occurs before the page's own recovery message can run.

Calendar embedding depends on the Google session and browser cookie policy; sign-in availability
inside Fully must be checked on the actual device. Do not make the calendar public as a workaround.
Spotify's registered redirect URI must match the **actual** production URL, including `/`.

Official references: [Fully Kiosk documentation](https://www.fully-kiosk.com/en/) and
[Cloudflare workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
