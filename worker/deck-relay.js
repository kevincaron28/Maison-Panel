const headers = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
const json = (data, status=200) => Response.json(data, {status, headers});
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const slots = ['starting','gaming','brb','ending'];

export function cleanSnapshot(value) {
  if (!value || typeof value !== 'object') throw new Error('invalid_state');
  const base = {connected:value.connected === true, enabled:value.enabled === true,
    computer:typeof value.computer === 'string' ? value.computer.slice(0,80) : 'PC studio', state:null};
  if (!base.connected) return base;
  const s = value.state;
  if (!s || typeof s.mic_mute !== 'boolean' || typeof s.audio_mute !== 'boolean' ||
      ![0,1,2].includes(s.stream_status) || typeof s.scene !== 'string' || s.scene.length>200 ||
      !Array.isArray(s.scenes) || s.scenes.length>100 ||
      s.scenes.some(n=>typeof n !== 'string' || !n || n.length>200) || new Set(s.scenes).size!==s.scenes.length)
    throw new Error('invalid_state');
  base.state = {mic_mute:s.mic_mute,audio_mute:s.audio_mute,stream_status:s.stream_status,scene:s.scene,scenes:s.scenes};
  return base;
}

export function deckCommand(body, mapping, snapshot) {
  if (!snapshot?.connected || !snapshot.enabled) throw new Error('studio_not_ready');
  if (slots.includes(body?.button)) {
    const scene = mapping[body.button];
    if (!snapshot.state.scenes.includes(scene)) throw new Error('scene_not_linked');
    return {action:'scene',scene};
  }
  if (['mic','audio'].includes(body?.button) && typeof body.muted === 'boolean')
    return {action:body.button,muted:body.muted};
  throw new Error('invalid_action');
}

// Only the authenticated Worker can call this object. Publisher credentials are
// checked here; they grant no access to other Maison APIs or viewer commands.
export class DeckRelay {
  constructor(ctx) {
    this.ctx=ctx; this.pending=new Map(); this.last=null; this.lastAt=0;
    this.revision=null; this.busy=false; this.serial=Promise.resolve();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  exclusive(fn) {
    const run=this.serial.then(fn,fn); this.serial=run.catch(()=>{}); return run;
  }
  socket() { return this.ctx.getWebSockets().find(s=>s.readyState===1); }
  async fetch(request) {
    const route=new URL(request.url).pathname.split('/').at(-1);
    let body={};
    if(request.method==='POST') {
      if(Number(request.headers.get('Content-Length'))>4096) return json({error:'too_large'},413);
      const text=await request.text(); if(text.length>4096) return json({error:'too_large'},413);
      try { body=JSON.parse(text); if(!body || Array.isArray(body) || typeof body!=='object') throw Error(); }
      catch { return json({error:'invalid_json'},400); }
    }
    if(route==='pair' && request.method==='POST') return this.exclusive(async()=>{
      const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%100000000).padStart(8,'0');
      await this.ctx.storage.put('pair',{hash:await hash(code),expires:Date.now()+300000,attempts:0});
      return json({code,expires:Date.now()+300000});
    });
    if(route==='enroll' && request.method==='POST') return this.exclusive(async()=>{
      const pair=await this.ctx.storage.get('pair');
      if(!pair || pair.expires<Date.now() || pair.attempts>=5) return json({error:'pairing_expired'},403);
      pair.attempts++; await this.ctx.storage.put('pair',pair);
      if(typeof body.code!=='string' || !/^\d{8}$/.test(body.code) || await hash(body.code)!==pair.hash)
        return json({error:'incorrect_code'},403);
      const token=secret();
      await this.ctx.storage.put('publisher',await hash(token));
      await this.ctx.storage.delete('pair');
      await this.ctx.storage.delete('mapping');
      this.disconnect();
      return json({token});
    });
    if(route==='revoke' && request.method==='POST') return this.exclusive(async()=>{
      await this.ctx.storage.delete('publisher'); await this.ctx.storage.delete('pair');
      this.disconnect(); return json({ok:true});
    });
    if(route==='publisher' && request.method==='GET') {
      const token=request.headers.get('Authorization')?.replace(/^Bearer /,'') || '';
      if(!/^[a-f0-9]{64}$/.test(token) || await hash(token)!==await this.ctx.storage.get('publisher'))
        return json({error:'unauthorized'},401);
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket') return json({error:'websocket_required'},426);
      this.disconnect();
      const [client,server]=Object.values(new WebSocketPair()); this.ctx.acceptWebSocket(server);
      return new Response(null,{status:101,webSocket:client});
    }
    if(route==='state' && request.method==='GET') {
      const mapping=await this.ctx.storage.get('mapping') || {};
      if(!this.socket()) return json({connected:false,enabled:false,computer:null,state:null,mapping,revision:null});
      try {
        const data=await this.ask({type:'state'});
        this.last=cleanSnapshot(data.snapshot); this.lastAt=Date.now(); this.revision=crypto.randomUUID();
        return json({...this.last,mapping,revision:this.revision});
      } catch { this.last=null; return json({error:'computer_unavailable'},503); }
    }
    if(route==='mapping' && request.method==='POST') {
      if(!this.last?.connected || Date.now()-this.lastAt>8000) return json({error:'refresh_required'},409);
      const mapping={};
      for(const slot of slots) {
        const value=body[slot];
        if(typeof value!=='string' || (value && !this.last.state.scenes.includes(value))) return json({error:'invalid_scene'},400);
        mapping[slot]=value;
      }
      await this.ctx.storage.put('mapping',mapping); return json({ok:true});
    }
    if(route==='action' && request.method==='POST') {
      if(this.busy) return json({error:'action_pending'},409);
      if(!this.revision || body.revision!==this.revision || Date.now()-this.lastAt>8000)
        return json({error:'refresh_required'},409);
      this.busy=true;
      try {
        const command=deckCommand(body,await this.ctx.storage.get('mapping') || {},this.last);
        this.revision=null; // A displayed state can authorize only one command.
        const result=await this.ask({type:'action',command,expires:Date.now()+5000});
        this.last=null;
        return result.ok===true ? json({ok:true}) : json({error:result.error || 'action_unconfirmed'},409);
      } catch { this.last=null; return json({error:'action_unconfirmed'},409); }
      finally { this.busy=false; }
    }
    return json({error:'not_found'},404);
  }
  ask(message) {
    const socket=this.socket(); if(!socket || this.pending.size>=4) return Promise.reject(Error('unavailable'));
    const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('timeout'));},12000);
      this.pending.set(id,{socket,resolve,reject,timer});
      try { socket.send(JSON.stringify({...message,id})); }
      catch {clearTimeout(timer);this.pending.delete(id);reject(Error('disconnected'));}
    });
  }
  webSocketMessage(socket,message) {
    if(typeof message!=='string' || message.length>40000) return;
    try {
      const data=JSON.parse(message), item=this.pending.get(data.id);
      if(!item || item.socket!==socket) return;
      clearTimeout(item.timer);this.pending.delete(data.id);item.resolve(data);
    } catch { /* Unrecognized messages cannot execute commands. */ }
  }
  disconnect() {
    this.last=null;this.revision=null;
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('disconnected'));}
    this.pending.clear();
    for(const s of this.ctx.getWebSockets()) s.close(1000,'Disconnected');
  }
  webSocketClose(socket) {
    this.last=null;this.revision=null;
    for(const [id,p] of this.pending){if(p.socket===socket){clearTimeout(p.timer);p.reject(Error('disconnected'));this.pending.delete(id);}}
  }
  webSocketError(socket){this.webSocketClose(socket);}
}
