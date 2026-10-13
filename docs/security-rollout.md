# Panel privacy rollout

Requested October 13, 2026: protect the entire website, restrict access to the tablet,
and keep the Google agenda private.

## Latest coordination decision (supersedes rollout status below)

The user asked this security chat to check the other Cloudflare session first and
keep everything free. Read the active chat **Clarify bonjour and bonne nuit**
(`01a13486-bc61-7731-a99a-a0fb9e46a003`): the user explicitly approved removing the
extra Cloudflare gate while retaining Google authentication for private data.
That chat owns the ongoing removal, Calendar API setup and deployment verification.
Sent it the Access app/policy IDs, cache/privacy requirements and free-only constraint.
Do not re-enable Access or make conflicting deployments from this chat.

Consequences: the website shell becomes publicly reachable; private calendar and
reminder APIs must remain authenticated. This is not tablet-only protection.
No paid plan, custom hostname or tablet certificate is authorized by the free-only
choice. The records below describe the earlier applied state, not a claim that
Access remains enabled after the other chat's pending changes.

## Verified and applied

- Production is now protected by a Worker-level Cloudflare Access application,
  covering all production and preview URLs. This is account protection, not yet
  tablet-only protection.
- Access application: `d7bd2115-f7c6-4866-b3c3-74d626288e00`.
- Its only allow policy (`0ef2bd4c-54f7-45c8-ae86-8dfef4f5fe0f`,
  **Maison Panel — Kevin only**) requires both membership in the owner's Cloudflare
  account and the exact owner email. Independent MFA requires an authenticator
  application with a 24-hour verification duration. App session duration: 24 hours.
- HTTP Only cookies are enabled; OPTIONS bypass is disabled. Enabled the additional
  binding cookie protection against copied authorization tokens. This is not a
  substitute for tablet-specific authentication.
- Signed-out checks of `/`, `/settings.html`, `/config.js`, `/js/calendar.js`, and
  `/api/calendar` all returned HTTP 302 to `clearpointtrading.cloudflareaccess.com`
  without panel markup. Saved policy summary confirms the email requirement and MFA.
- Disabled Worker preview URLs through the Cloudflare API and verified
  `previews_enabled: false`. `wrangler.toml` also sets `preview_urls = false`
  so a later deployment preserves this choice.
- Inspected sharing for the exact Google calendar configured in the panel:
  **Make available to public is unchecked**. One existing person-to-person share
  remains intact; locking the panel does not revoke existing Google Calendar shares.
- At the time of inspection, production uses the Google Calendar iframe. It does not have the local
  native-calendar Worker deployed: `/api/calendar` returns 404 and the Worker has
  no configured bindings. The iframe relies on Google's existing calendar permissions.
  Another process subsequently updated the local Worker/KV deployment configuration;
  recheck production before continuing because that work may be deployed independently.
- No camera feeds are configured in the inspected local configuration.

## Tablet setup pending

The Wrangler token cannot manage Access (HTTP 403). After the user signed into
Chrome, the Access application and policy were created successfully in the dashboard.
The user confirmed **Fully Kiosk Browser**. No certificate, tablet registration,
new domain or paid subscription has been created.

Remaining work:

1. User must enroll their authenticator themselves through the team's App Launcher:
   `https://clearpointtrading.cloudflareaccess.com/AddMfaDevice`.
2. Test successful sign-in on the tablet, including Google calendar and Spotify.
   Signed-out tests confirm denial, but do not prove authorized kiosk compatibility.
3. Decide the tablet-only mechanism. Fully Kiosk supports P12/PFX client certificates
   under Web Content Settings (PLUS). The Cloudflare certificate form requires a
   hostname in an owned zone; `workers.dev` is not such a zone. Proposed hostname:
   `panel.clearpointtrading.dpdns.org`, pending the user's choice. Access mTLS is
   documented as paid; the dashboard displays Standard at $7/seat/month. No plan
   was selected and no purchase was made. A private-network approach is the other
   proposed option if recurring charges are unwanted.
4. Add the tablet requirement to that same allow policy as a required condition.
   A separate email-only allow policy would permit other devices.
5. Choose the device mechanism after confirming the tablet browser and account
   capabilities. A login cookie, user-agent match, shared household IP, or synced
   passkey alone does not establish tablet-only access. Client-certificate support
   and plan availability must be checked before selecting mTLS. Current Cloudflare
   documentation excludes Access mTLS from its Free plan.
6. Enroll the actual tablet, verify it works, and verify a second device is denied
   even when signed in as the owner. Keep credentials outside this public repository.

## Calendar and cache requirements

- Keep Google public sharing off. Do not use a secret iCal URL in browser code.
- If deploying `worker/index.js`, first configure its encrypted server-side storage,
  OAuth client credentials, canonical origin and exact owner allowlist. Keep the
  `calendar.events.readonly` scope; do not add write scopes.
- Require authentication for every calendar/reminder API request and verify that
  missing, invalid and expired sessions return no private data.
- Private API responses must use `Cache-Control: no-store, private` and must not be
  stored by service workers or offline caches.
- The in-progress service worker currently caches the website shell. Before release,
  ensure revocation/logout cannot reopen a cached protected panel. Coordinate this
  with the existing in-progress application work; this security task did not deploy it.

## Acceptance checks still required

- Repeat the signed-out checks after any further domain/policy/deployment changes.
- Preview URLs are disabled; alternate hostnames cannot bypass Access.
- Correct account on an unapproved device is denied.
- Tablet can load the panel, show its private calendar, and complete session renewal.
- Revoking tablet access prevents new requests; verify cache/offline behavior separately.
- Google calendar remains non-public, and no camera/calendar credentials appear in
  client assets, Git history added by this rollout, or logs.

References:

- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/independent-mfa/
- https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/mutual-tls-authentication/
- https://www.fully-kiosk.com/en/
