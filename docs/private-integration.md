# Private integration operations

The frontend is public. `/api/*` is a Cloudflare Worker limited to the verified email in `ALLOWED_EMAIL`. It requests Google `openid`, email and `calendar.events.readonly`, and reads the primary calendar. No event-write scope is requested. `APP_ORIGIN` and the registered redirect must match exactly.

Google project: `jovial-current-511509-p9` (Maison Panel). OAuth client: Maison Panel private agenda. Redirect: `https://maison-panel.kcaron.workers.dev/api/auth/callback`. Cloudflare KV binding: `PRIVATE_DATA` (`maison-private`).

Cloudflare secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`. Set using Wrangler secret commands; never put them into config.js, Git, screenshots or logs. Changing the encryption secret makes existing encrypted records unreadable; do not rotate it casually. Keep any recovery material in the owner's password manager, not this repository.

OAuth uses PKCE and a ten-minute encrypted state cookie. Panel sessions are opaque, HttpOnly/Secure/SameSite cookies with a 90-day maximum. Refresh/access tokens and synced reminders use AES-GCM encryption in KV. Session records contain a hashed account identifier and expiry. Calendar event responses are no-store and not persisted by the app. Account identity is validated with Google's verified email before issuing a session.

As of October 13, 2026, Calendar API is enabled and the OAuth app is In production. The user approved removal of the panel-specific Cloudflare Access gate; the shell is public, private APIs remain owner-only, and preview URLs are disabled. No paid upgrade was enabled.

Google's Testing publishing status expires calendar grants after seven days. Production personal-use applications can avoid the testing expiry without undergoing verification, but Google may display an unverified-app consent notice. See [Google audience rules](https://support.google.com/cloud/answer/15549945?hl=en) and [personal-use verification exception](https://support.google.com/cloud/answer/13464323?hl=en). Production status does not override the Worker's owner-only account check.

Reminders merge by ID and `updatedAt`. Archive keeps a tombstone so another device cannot resurrect the old entry. Sync runs each minute while open and on reconnect. KV is eventually consistent; brief propagation delays are possible. Concurrent edits to the same reminder use the newest device timestamp, so device clocks must be correct. Local edits are preserved during in-flight writes and sent on the next sync. Limit: 100 active entries in the UI, 1,000 total entries including archive. This is display sync, not push notifications.

Disconnect in Settings ends this browser's panel session and clears native agenda content in other open tabs immediately. Restoring a page from browser back/forward memory clears the agenda before rechecking authorization. It retains local reminders, the owner's server reminders and the Google grant for other devices. To revoke all Google access, remove Maison Panel from the Google Account's connected apps. For complete server deletion, the account owner can remove the `google:`, `reminders:` and `session:` records from the dedicated `maison-private` namespace using Cloudflare's KV interface; confirm permanent deletion first. Clear the panel's site data on each device separately. Do not delete unrelated namespaces.

Development: `npm test` uses only fake identities/tokens. `npx wrangler dev` uses local KV and no production secrets. Use an independently registered localhost client if developing OAuth locally. Build: `npm run package`; deploy: `npx wrangler deploy`. Capture the preceding version ID with `npx wrangler deployments list` before release; `npx wrangler rollback <version-id>` restores that code version. Rollback does not undo KV writes or revoke credentials.

Owned assets are allowlisted into `dist/`, then precached with a content hash. The service worker never intercepts `/api/*`, third-party requests, or non-GET traffic. An explicit update button activates a waiting version. A device must install the shell online before it can start offline; private agenda content requires connectivity after a restart.
