// Local bridge for Maison Panel — speaker control only. A browser genuinely can't do Cast-protocol
// device discovery itself, so this small always-on process exists to do it instead. Markets no
// longer routes through here (see server/README.md and js/markets.js) — it fetches FMP directly
// from the browser, one symbol at a time, with no server involved.
const express = require("express");
const ChromecastAPI = require("chromecast-api");

const PORT = process.env.PORT || 8787;
const STATUS_TIMEOUT_MS = 4000;

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// id -> { device, friendlyName, host } — keyed by a slug of the device's friendly name (stable
// across DHCP lease changes) rather than its host IP.
const speakers = new Map();

const castClient = new ChromecastAPI();

castClient.on("device", (device) => {
  const id = slugify(device.friendlyName);
  speakers.set(id, device);
  console.log(`[speaker-bridge] discovered "${device.friendlyName}" (${device.host}) as "${id}"`);
});

// Cast devices don't always announce themselves right away — ask again periodically.
setInterval(() => castClient.update(), 30 * 1000);

// Runs a node-callback-style function and races it against a timeout, since a sleeping or
// offline speaker otherwise leaves the Cast socket call hanging indefinitely.
function withTimeout(runCallbackStyle, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    runCallbackStyle((err, result) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Receiver-level status (which app is running, volume) works regardless of what launched it —
// Assistant voice command, Spotify, YouTube Music, or this bridge. Transport controls below
// (pause/resume/stop) only work for sessions chromecast-api can join — in practice that's content
// this bridge cast itself, or the built-in YouTube/default media receiver apps. A session started
// by a third-party app's own Cast receiver (Spotify's, for instance) may report status here but
// not respond to pause/resume — that's a Cast protocol limitation, not a bug here. Verify against
// your actual speakers; this can't be tested without real hardware on the LAN.
async function readSpeaker(id, device) {
  try {
    const status = await withTimeout((cb) => device.getReceiverStatus(cb), STATUS_TIMEOUT_MS);
    const app = status?.applications?.[0];
    return {
      id,
      name: device.friendlyName,
      host: device.host,
      reachable: true,
      app: app?.displayName || null,
      statusText: app?.statusText || null,
      volume: status?.volume?.level ?? null,
      muted: status?.volume?.muted ?? null,
    };
  } catch (err) {
    return { id, name: device.friendlyName, host: device.host, reachable: false };
  }
}

const app = express();
app.use(express.json());

// LAN-only tool with no secrets in play — a permissive CORS policy is fine here and is what lets
// the HTTPS-hosted panel call this plain-HTTP local service at all.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, speakerCount: speakers.size });
});

app.get("/api/speakers", async (req, res) => {
  const results = await Promise.all(
    [...speakers.entries()].map(([id, device]) => readSpeaker(id, device))
  );
  res.json(results);
});

function findSpeaker(req, res) {
  const device = speakers.get(req.params.id);
  if (!device) {
    res.status(404).json({ ok: false, error: `unknown speaker "${req.params.id}"` });
    return null;
  }
  return device;
}

app.post("/api/speakers/:id/pause", (req, res) => {
  const device = findSpeaker(req, res);
  if (!device) return;
  device.pause((err) => res.json({ ok: !err, error: err?.message }));
});

app.post("/api/speakers/:id/resume", (req, res) => {
  const device = findSpeaker(req, res);
  if (!device) return;
  device.resume((err) => res.json({ ok: !err, error: err?.message }));
});

app.post("/api/speakers/:id/stop", (req, res) => {
  const device = findSpeaker(req, res);
  if (!device) return;
  device.stop((err) => res.json({ ok: !err, error: err?.message }));
});

app.post("/api/speakers/:id/volume", (req, res) => {
  const device = findSpeaker(req, res);
  if (!device) return;
  const level = Number(req.body?.level);
  if (!(level >= 0 && level <= 1)) {
    return res.status(400).json({ ok: false, error: "level must be a number between 0 and 1" });
  }
  device.setVolume(level, (err) => res.json({ ok: !err, error: err?.message }));
});

app.listen(PORT, () => {
  console.log(`[speaker-bridge] listening on http://0.0.0.0:${PORT}`);
  console.log("[speaker-bridge] waiting for Cast devices to announce themselves...");
});
