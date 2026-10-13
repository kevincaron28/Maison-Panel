import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { createPtz } from './camera-ptz.mjs';
import { createCameraStream } from './camera-stream.mjs';

// Config and binaries live outside the public repository, under LOCALAPPDATA.
const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const control = createPtz(config);
const stream = createCameraStream(config);
if (!/^wss:\/\//.test(config.endpoint)) throw new Error("Secure relay required");
let busy = false, stopping = false, socket, reconnect, heartbeat, lastPong;
const log = text => console.log(new Date().toISOString(), text);
function connect() {
  socket = new WebSocket(config.endpoint, { headers: { Authorization: `Bearer ${config.secret}` }, maxPayload: 4096, handshakeTimeout: 15000 });
  socket.on("open", () => {
    log("Camera bridge connected"); lastPong = Date.now();
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
    if (command.type !== "capture" || typeof command.id !== "string" || busy) return;
    busy = true; const target = socket;
    try {
      const jpeg = await stream.capture();
      if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ id: command.id, jpeg: jpeg.toString("base64") }));
    } catch {
      if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ id: command.id, error: true }));
      log("Camera capture unavailable; will retry on next view");
    } finally { busy = false; }
  });
  socket.on("error", () => log("Relay unavailable; reconnecting"));
  socket.on("close", () => { stream.stop(); clearInterval(heartbeat); if (!stopping) reconnect = setTimeout(connect, 10000); });
}
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; stream.stop(); clearTimeout(reconnect); clearInterval(heartbeat); socket?.close(); });
connect();
