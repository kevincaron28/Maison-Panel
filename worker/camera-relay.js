const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
// The viewer shows a specific cause: the PC bridge is offline, or the PC is up but the camera is not answering.
const unavailable = (reason = "camera_unavailable") =>
  Response.json({ error: reason }, { status: 503, headers });

// Frames exist only during a viewer request. No image is written to storage.
export class CameraRelay {
  constructor(ctx) {
    this.ctx = ctx;
    this.pending = null;
    this.controls = new Map();
    this.cameraState = "unknown"; // Reported by the bridge; memory only.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  async fetch(request) {
    if (new URL(request.url).pathname.endsWith("/publisher")) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return new Response("WebSocket required", { status: 426, headers });
      for (const socket of this.ctx.getWebSockets()) socket.close(1000, "Replaced");
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    const socket = this.ctx.getWebSockets().find(ws => ws.readyState === 1);
    if (!socket) return unavailable("pc_offline");
    if (new URL(request.url).pathname.endsWith('/control')) {
      const {action} = await request.json();
      if (!['left','right','up','down','stop'].includes(action)) return new Response(null,{status:400,headers});
      if (this.controls.size >= (action === 'stop' ? 2 : 1)) return new Response(null,{status:409,headers});
      const id = crypto.randomUUID();
      const promise = new Promise(resolve => {
        const timer = setTimeout(()=>this.finishControl(id,false),7000);
        this.controls.set(id,{resolve,timer});
      });
      try { socket.send(JSON.stringify({type:'control',id,action})); } catch { this.finishControl(id,false); }
      return (await promise) ? Response.json({ok:true},{headers}) : unavailable(this.reason());
    }
    if (!this.pending) {
      const id = crypto.randomUUID();
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      const timer = setTimeout(() => this.finish(null, "camera_timeout"), 12000);
      this.pending = { id, resolve, promise, timer };
      try { socket.send(JSON.stringify({ type: "capture", id })); }
      catch { this.finish(null, "pc_offline"); return unavailable("pc_offline"); }
    }
    const { frame, reason } = await this.pending.promise;
    return frame ? new Response(frame, { headers: { ...headers, "Content-Type": "image/jpeg" } }) : unavailable(reason);
  }
  reason() { return this.cameraState === "unreachable" ? "camera_unreachable" : "camera_unavailable"; }
  finish(frame, reason) {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.resolve({ frame, reason: reason || this.reason() });
    this.pending = null;
  }
  finishControl(id,ok) {
    const pending = this.controls.get(id);
    if (!pending) return;
    clearTimeout(pending.timer); pending.resolve(ok); this.controls.delete(id);
  }
  webSocketMessage(socket, message) {
    if (typeof message !== "string" || message.length > 700000) return;
    try {
      const data = JSON.parse(message);
      if (data.type === "status") {
        if (["ok", "unreachable"].includes(data.camera)) this.cameraState = data.camera;
        return;
      }
      if (this.controls.has(data.id)) { this.finishControl(data.id,data.ok === true); return; }
      if (!this.pending || data.id !== this.pending.id) return;
      if (data.error === "busy") return this.finish(null, "camera_busy");
      if (data.error) { this.cameraState = "unreachable"; return this.finish(null, "camera_unreachable"); }
      const frame = Uint8Array.from(atob(data.jpeg), c => c.charCodeAt(0));
      if (frame.length < 4 || frame.length > 500000 || frame[0] !== 255 || frame[1] !== 216 || frame.at(-2) !== 255 || frame.at(-1) !== 217)
        return this.finish(null);
      this.cameraState = "ok";
      this.finish(frame);
    } catch { this.finish(null); }
  }
  webSocketClose() { this.cameraState = "unknown"; this.finish(null, "pc_offline"); for(const id of this.controls.keys()) this.finishControl(id,false); }
  webSocketError() { this.webSocketClose(); }
}
