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
sits in GitHub; it isn't a website yet. Cloudflare's dashboard now onboards new static sites
through its **Workers** flow (Pages and Workers have merged) — it reads the code and turns it into
`https://something.workers.dev` that the tablet can open.

1. Go to **[dash.cloudflare.com](https://dash.cloudflare.com)** and log in (Kevin already has an
   account from `cpt-ai.pages.dev`).
2. In the left sidebar, click **Workers & Pages**.
3. Click **Create** → **Connect to Git**.
4. If GitHub isn't connected yet, click **Connect GitHub** and approve it. Since the repo is
   **private**, make sure you grant Cloudflare access to `kevincaron28/Maison-Panel` specifically
   (either "all repositories" or pick it from the list).
5. Select the **Maison-Panel** repository, then click **Begin setup**.
6. Pick the branch to deploy — **`main`**, the branch that should always be live on the wall.
7. Build settings — this project has **no build step**, but Cloudflare's Workers flow still asks
   for two fields:
   - **Build command**: leave **blank**
   - **Deploy command**: `npx wrangler deploy` — the repo already has a `wrangler.toml` telling
     Cloudflare to serve the whole repo as static files, no Worker script needed
8. Click **Deploy**. Wait about 30–60 seconds.
9. Cloudflare gives you a URL like `https://maison-panel.kevincaron28.workers.dev`. **Write this
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
2. **Apps → Play Store**: turn off auto-updates (Settings → Network preferences → Auto-update
   apps → Don't auto-update apps). You don't want an app update popping a dialog over the panel
   at 3am.
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

**Calendar** — built as a private embed, so nothing needs to be made public. `config.js` →
`calendar.calendarId` is already set to Kevin's Google account. The one remaining step is on the
tablet: sign into that same Google account in Fully Kiosk Browser (Settings → there's a "manage
Google account" / normal Chrome-engine sign-in flow — it's the same as signing into Chrome on any
Android device). The calendar tile only shows events while that sign-in holds.

If it ends up looking too much like a plain Google Calendar widget bolted onto the panel (it will —
that's the trade-off for keeping it private), the fallback is Path A in `docs/project-brief.md`
§5.3: make a calendar public and switch `calendar.mode` to `"api"` for full styling control.

**Markets** — uses Financial Modeling Prep (`config.js` → `markets.fmpKey`, already set), not
Finnhub — free Finnhub turned out to be delayed/inconsistent in practice despite its marketing, and
FMP's free tier is honestly the same shape (end-of-day, not live intraday). It fetches each symbol
directly from the browser, no server involved. Nothing more to do here.

## Camera — not yet

Camera hardware hasn't been bought yet, so there's nothing to configure — `config.js` →
`camera.enabled` stays `false` until it is. See `docs/project-brief.md` §11.2 for what's needed
once a camera's picked (brand/model decides whether snapshot polling is even possible).

## Changing settings later (location, units, etc.)

Everything tunable lives in one file: **`config.js`**, at the root of the repo. To change
something (say, the exact coordinates, or Celsius→Fahrenheit):

1. Edit `config.js` on GitHub (or locally, then `git push`).
2. Push it to the `main` branch.
3. Cloudflare redeploys automatically within about a minute.
4. The tablet picks it up the next time it reloads (at most, by the next 3am auto-reload).

No app store, no manual install, no touching the tablet at all.
