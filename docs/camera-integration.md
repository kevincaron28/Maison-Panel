# HM203 camera integration

The Caméras button opens refreshing still images, approximately every five seconds plus capture time. This is not full-motion video or audio. The owner signs in through Settings using the same private session as the calendar. Anonymous viewers cannot obtain images; the PC publisher credential cannot read them.

The HM203 works over Ethernet and exposes ONVIF and RTSP. Its advertised JPEG endpoint returns an empty response. A Windows bridge uses FFmpeg to capture one fresh JPEG when a signed-in viewer requests it. The PC maintains an outbound authenticated WSS connection to a Cloudflare Durable Object. No router ports are opened. Images pass through Cloudflare in memory for that request; they are not stored in KV, SQLite, browser storage, or the service-worker cache. The socket hibernates while idle. Closing the view stops capture requests.

The PC must remain awake and connected. The camera must remain powered and connected by Ethernet until Wi-Fi is separately configured. The bridge reconnects after outages. A failed capture appears as unavailable rather than leaving an old image visible.

## Local installation

Runtime directory: `%LOCALAPPDATA%\MaisonPanel\camera-bridge`. It contains FFmpeg from the Windows-build provider linked by ffmpeg.org, `camera-bridge.mjs`, the `ws` package, and an owner-restricted `config.json`. The config contains `endpoint` (the WSS publisher route), `secret`, `ffmpeg` (absolute binary path), and `rtsp` (private camera URL). Never copy this file or camera images into the repository or public assets.

The source of the bridge is `scripts/camera-bridge.mjs`. Copy it to the runtime directory after updates. Its only extra Node dependency is `ws`, copied from the project's installed dependency. Node 24+ is required. **Automatic approval review blocked the Windows auto-start setup, including a retry without an execution-policy override. No auto-start entry or launcher was installed.** The bridge currently runs as a temporary Node process. Logs contain connection/error status only, not frames or secrets.

To start manually in PowerShell:

```powershell
node "$env:LOCALAPPDATA/MaisonPanel/camera-bridge/camera-bridge.mjs" "$env:LOCALAPPDATA/MaisonPanel/camera-bridge/config.json"
```

Keep that process running while viewing. Automatic startup remains a separate unresolved installation step.

The camera currently uses DHCP. If its address changes, reserve its address on the router or update `rtsp` in the private config and restart the bridge. Router reservations and Wi-Fi setup have not been changed by this installation.

## Cloud configuration and recovery

`CAMERA_BRIDGE_SECRET` is a separate Wrangler secret matching the private PC config. `CAMERA_RELAY` uses the `CameraRelay` Durable Object class and a SQLite migration compatible with Workers Free. It writes no storage. No paid plan is enabled by this integration. Usage remains subject to the account's existing limits; quota failures show an unavailable camera.

To disable: set the camera feed's `enabled` to false and deploy, then stop the bridge process. Revoke the publisher by deleting the Worker secret and closing its active socket (a code deployment disconnects/reconnects it). Existing private panel sessions are unaffected.

Tests cover anonymous denial, publisher/viewer separation, concurrent viewer requests, malformed frames and non-storage. Verify the deployed signed-in view and a separate anonymous request after release. A tablet requires its own private panel sign-in and an updated shell.

October 13 verification: all 56 tests passed, calendar coverage check passed, and packaging/deployment succeeded. Release `2026.10.13-a8dfeba9ffd2`, Worker version `c37d5bf2-9b05-4c38-b62e-f3179de297e7`. The production signed-in browser displayed fresh camera images and enlargement; an anonymous production snapshot request returned 401. Windows auto-start remains blocked. Tablet display and Wi-Fi have not been verified.

## Direction controls

The camera view now provides large up/down/left/right and Stop buttons. Owner-authenticated, same-origin JSON POSTs to `/api/camera/control` accept only those five actions. The relay serializes movement requests, with a separate stop slot and bounded response timeout. The bridge's `camera-ptz.mjs` uses the verified HM203 ONVIF PTZ endpoint and Profile_1 on the same host as its private RTSP configuration. A move requests a 0.4-second camera timeout and sends an explicit Stop after 250 ms; Stop is also attempted when the movement request fails. No arbitrary URLs, XML, credentials or commands are accepted from the browser.

Copy both bridge modules to the private runtime directory when updating. The bridge was restarted manually for this release; auto-start remains unresolved. Live left/right commands and Stop were acknowledged by the camera, and production browser movement requests completed successfully. The image remains a periodically refreshed snapshot, so movement feedback may take several seconds. Audio, optical zoom, presets and tracking controls are not included.
