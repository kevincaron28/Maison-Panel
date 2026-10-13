import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { createPtz } from './camera-ptz.mjs';

// Config and binaries live outside the public repository, under LOCALAPPDATA.
const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const control = createPtz(config);
if (!/^wss:\/\//.test(config.endpoint)) throw new Error("Secure relay required");
let busy = false, stopping = false, socket, reconnect, heartbeat, lastPong;
const log = text => console.log(new Date().toISOString(), text);
function capture() {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpeg, ["-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-timeout", "7000000", "-i", config.rtsp, "-an", "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "5", "-f", "image2pipe", "pipe:1"], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const chunks = []; let size = 0;
    const timer = setTimeout(() => child.kill(), 10000);
    child.stdout.on("data", chunk => { size += chunk.length; if (size > 500000) child.kill(); else chunks.push(chunk); });
    child.on("error", () => { clearTimeout(timer); reject(new Error("capture_failed")); });
    child.on("close", code => { clearTimeout(timer); const jpeg = Buffer.concat(chunks); code === 0 && jpeg.length > 4 && size <= 500000 ? resolve(jpeg) : reject(new Error("capture_failed")); });
  });
}
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
      const jpeg = await capture();
      if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ id: command.id, jpeg: jpeg.toString("base64") }));
    } catch {
      if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ id: command.id, error: true }));
      log("Camera capture unavailable; will retry on next view");
    } finally { busy = false; }
  });
  socket.on("error", () => log("Relay unavailable; reconnecting"));
  socket.on("close", () => { clearInterval(heartbeat); if (!stopping) reconnect = setTimeout(connect, 10000); });
}
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; clearTimeout(reconnect); clearInterval(heartbeat); socket?.close(); });
connect();
