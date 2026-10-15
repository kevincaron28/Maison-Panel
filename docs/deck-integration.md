# Maison Deck — installation and operation

The Deck page uses the existing Maison owner session. The Windows companion
connects outward using TLS to a dedicated Cloudflare Durable Object. No router
port forwarding, camera access, browser mixed-content exception or Elgato
software is required. This independent adapter is not an official TikTok plugin.

## On the test PC, then on the wife's PC
1. Open LIVE Studio to its main screen, offline for initial testing.
2. Extract and run Lantern Deck 2.0. The top section is Maison direct control.
3. On Maison, open **Deck > Configuration > Connecter un PC** while signed in.
4. Enter that eight-digit code in Lantern Deck and click **Connect to Maison**.
5. Check **Allow Maison to control scenes and audio** on the Windows PC.
6. In Maison Configuration, select the existing scene for each of the four
   slots and save. The two audio controls require no hotkeys or mappings.
7. Test each audio control twice, verifying its actual LIVE Studio indicator.
   Test scenes offline. The End button only changes scenes; it cannot stop LIVE.

Only one PC is paired with this deck at a time. Pairing the wife's PC revokes
the test PC credential and clears scene mappings so they can be chosen afresh.
Her scenes, TikTok account and audio hardware remain on her PC. The same Maison
account used for private calendar access is required on the home panel.

The companion remembers pairing in `%LOCALAPPDATA%\LanternDeck\maison-connection.json`.
That file is a credential: do not share it or include it in a source bundle.
Direct control starts disabled each time the companion is launched. The user
must enable it locally. The old phone/hotkey deck remains under an optional
section and does not control the Maison direct connection.

## How it works
Panel (HTTPS, owner session) -> authenticated Worker -> DeckRelay -> outbound
Windows WebSocket -> local LIVE Studio Socket.IO channel. The protocol was
cross-checked against the installed LIVE Studio 1.14.2 source. It is internal
and version-sensitive: a TikTok update may require an adapter update.

The adapter only exposes scene selection and microphone/desktop audio target
mute states. It reads a fresh state before acting, verifies the postcondition,
and never retries an uncertain toggle. Unknown/stale state disables controls.
Commands have short deadlines and unique IDs; there is no offline command queue.
No start/stop LIVE, recording, arbitrary shell or arbitrary plugin-action route
exists. Camera and Google credentials are not used by the PC companion.

## Deployment
Run `npm test`, `npm run check:calendar`, `npm run package`, then Wrangler deploy.
The `deck-v1` migration adds a separate SQLite Durable Object binding. Existing
calendar and camera storage are unchanged. The relay needs no new static secret;
owner-generated one-time pairing codes enroll a narrowly scoped publisher key.
Only its hash is stored server-side. Owner sign-out ends viewer access; use
**Déconnecter le PC** in Deck to revoke the publisher credential.

There is no license fee for this custom code or Elgato subscription. Maison
mode uses Internet and Cloudflare's existing account. Free-tier limits apply;
zero cost at arbitrary usage cannot be guaranteed. The page polls only while
visible, and no studio state is written into the offline cache or durable storage.
The relay stores hashed pairing/publisher credentials and chosen scene mappings.

## Verification
Automated tests cover pairing replay/attempt limits, owner-only routes, CSRF,
state schema, action allowlist, stale-state rejection, duplicate command handling,
scene/mute postconditions, client UI disable states, and existing panel regressions.
Live PC and physical tablet verification is tracked separately in the delivery
report; mocks do not certify an installed LIVE Studio version or home network.
