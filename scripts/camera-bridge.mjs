import { appendFileSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import WebSocket from "ws";
import { createPtz } from './camera-ptz.mjs';
import { createCameraStream } from './camera-stream.mjs';
import { findCamera, redact } from './camera-discovery.mjs';

// Config and binaries live outside the public repository, under LOCALAPPDATA.
const configPath = process.argv[2];
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (!/^wss:\/\//.test(config.endpoint)) throw new Error("Secure relay required");
const logPath = path.join(path.dirname(configPath), "bridge.log");

// Logs hold connection status only: never frames, secrets or the camera URL's credentials.
function log(text) {
  const line = `${new Date().toISOString()} ${redact(text)}\n`;
  process.stdout.write(line);
  try {
    if (statSync(logPath, { throwIfNoEntry: false })?.size > 1_000_000) renameSync(logPath, logPath + ".1");
    appendFileSync(logPath, line);
  } catch { /* logging must never stop the bridge */ }
}
// Crash loudly so the supervisor restarts a clean process instead of a half-working one.
process.on("uncaughtException", error => { log(`Bridge crashed: ${error?.message}`); process.exit(1); });
process.on("unhandledRejection", error => { log(`Bridge crashed: ${error?.message}`); process.exit(1); });

// One bridge per PC: two would replace each other's relay socket every few seconds.
const lock = net.createServer().on("error", () => { log("Another camera bridge is already running; exiting"); process.exit(0); });
lock.listen(47821, "127.0.0.1", start);

function start() {
  const control = createPtz(config);
  const stream = createCameraStream(config, reason => log(`FFmpeg: ${reason}`));
  let busy = false, stopping = false, socket, reconnect, heartbeat, lastPong, failures = 0, cameraState = "unknown", lastSearch = 0;
  const report = state => {
    if (state === cameraState) return;
    cameraState = state; log(`Camera ${state}`);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "status", camera: state }));
  };
  async function rediscover() {
    // DHCP may move the camera; look for its MAC at most once a minute.
    if (!config.mac || Date.now() - lastSearch < 60000) return;
    lastSearch = Date.now();
    const current = new URL(config.rtsp);
    const found = await findCamera(current.hostname, config.mac);
    if (!found || found === current.hostname) return log(found ? "Camera address unchanged" : "Camera not found on the network");
    current.hostname = found;
    config.rtsp = current.toString();
    try {
      const saved = JSON.parse(readFileSync(configPath, "utf8"));
      saved.rtsp = config.rtsp;
      writeFileSync(configPath + ".tmp", JSON.stringify(saved, null, 2));
      renameSync(configPath + ".tmp", configPath);
    } catch { log("Could not save the new camera address; using it until restart"); }
    log(`Camera found at new address ${found}`);
  }
  function connect() {
    socket = new WebSocket(config.endpoint, { headers: { Authorization: `Bearer ${config.secret}` }, maxPayload: 4096, handshakeTimeout: 15000 });
    socket.on("open", () => {
      log("Camera bridge connected"); lastPong = Date.now();
      if (cameraState !== "unknown") socket.send(JSON.stringify({ type: "status", camera: cameraState }));
      heartbeat = setInterval(() => {
        if (Date.now() - lastPong > 90000) return socket.terminate();
        if (socket.readyState === WebSocket.OPEN) socket.send("ping");
      }, 30000);
    });
    socket.on("message", async raw => {
      if (raw.toString() === "pong") { lastPong = Date.now(); return; }
      let command; try { command = JSON.parse(raw); } catch { return; }
      if (command.type === 'control' && typeof command.id === 'string') {
        const target = socket;
        let ok = false;
        try { await control(command.action); ok = true; } catch { log('Camera control unavailable'); }
        if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify({id:command.id,ok}));
        return;
      }
      if (command.type !== "capture" || typeof command.id !== "string") return;
      const target = socket;
      if (busy) {
        // Answer instead of staying silent, so the viewer is not left waiting 12 s.
        if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ id: command.id, error: "busy" }));
        return;
      }
      busy = true;
      try {
        const jpeg = await stream.capture();
        failures = 0; report("ok");
        if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ id: command.id, jpeg: jpeg.toString("base64") }));
      } catch {
        failures++;
        if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ id: command.id, error: true }));
        if (failures >= 2) { report("unreachable"); rediscover().catch(() => {}); }
      } finally { busy = false; }
    });
    socket.on("error", error => log(`Relay unavailable (${error?.code || error?.message || "error"}); reconnecting`));
    socket.on("close", () => { stream.stop(); clearInterval(heartbeat); if (!stopping) reconnect = setTimeout(connect, 10000); });
  }
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
    stopping = true; stream.stop(); clearTimeout(reconnect); clearInterval(heartbeat); socket?.close(); lock.close();
  });
  log("Camera bridge starting");
  connect();
}
