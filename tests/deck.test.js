import test from 'node:test';
import assert from 'node:assert/strict';
import {DeckRelay, cleanSnapshot, deckCommand} from '../worker/deck-relay.js';
import worker from '../worker/index.js';
const snapshot={connected:true,enabled:true,computer:'Test PC',state:{mic_mute:false,audio_mute:false,stream_status:0,scene:'Game',scenes:['Game','BRB']}};
function setup(t){
  const old=globalThis.WebSocketRequestResponsePair;globalThis.WebSocketRequestResponsePair=class{};t.after(()=>globalThis.WebSocketRequestResponsePair=old);
  const records=new Map(),sockets=[];
  const ctx={setWebSocketAutoResponse(){},getWebSockets:()=>sockets,storage:{get:async k=>records.get(k),put:async(k,v)=>records.set(k,v),delete:async k=>records.delete(k)}};
  return {relay:new DeckRelay(ctx),records,sockets};
}
const req=(route,body)=>new Request('https://panel.test/api/deck/'+route,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
test('deck strips extra fields, validates actual state and restricts actions',()=>{
  assert.equal(cleanSnapshot({...snapshot,secret:'no'}).secret,undefined);
  assert.throws(()=>cleanSnapshot({...snapshot,state:{...snapshot.state,mic_mute:'false'}}));
  assert.deepEqual(deckCommand({button:'mic',muted:true},{},snapshot),{action:'mic',muted:true});
  assert.throws(()=>deckCommand({button:'livestartend'},{},snapshot));
  assert.throws(()=>deckCommand({button:'starting'},{starting:'Missing'},snapshot));
  assert.throws(()=>deckCommand({button:'mic',muted:true},{},{...snapshot,enabled:false}));
});
test('pairing is one-use, limited and stores only a token hash',async t=>{
  const {relay,records}=setup(t);
  const {code}=await (await relay.fetch(req('pair',{}))).json();
  const response=await relay.fetch(req('enroll',{code}));assert.equal(response.status,200);
  const {token}=await response.json();assert.equal(token.length,64);assert.notEqual(records.get('publisher'),token);
  assert.equal((await relay.fetch(req('enroll',{code}))).status,403);
  const next=await (await relay.fetch(req('pair',{}))).json();
  for(let i=0;i<5;i++) assert.equal((await relay.fetch(req('enroll',{code:'bad'}))).status,403);
  assert.equal((await relay.fetch(req('enroll',{code:next.code}))).status,403);
  assert.equal((await relay.fetch(req('publisher'))).status,401);
  await relay.fetch(req('revoke',{}));assert.equal(records.has('publisher'),false);
});
test('two concurrent enrollments cannot reuse a code',async t=>{
  const {relay}=setup(t);const {code}=await (await relay.fetch(req('pair',{}))).json();
  const results=await Promise.all([relay.fetch(req('enroll',{code})),relay.fetch(req('enroll',{code}))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);
});
test('commands require current revision and matching publisher response',async t=>{
  const {relay,sockets,records}=setup(t);let message;
  const socket={readyState:1,send(raw){message=JSON.parse(raw);},close(){this.readyState=3;}};sockets.push(socket);
  records.set('mapping',{gaming:'Game',brb:'BRB'});
  const pending=relay.fetch(req('state'));await new Promise(r=>setImmediate(r));
  relay.webSocketMessage(socket,JSON.stringify({id:message.id,snapshot}));
  const state=await (await pending).json();assert.equal(state.computer,'Test PC');
  assert.equal((await relay.fetch(req('action',{button:'mic',muted:true,revision:'old'}))).status,409);
  const action=relay.fetch(req('action',{button:'mic',muted:true,revision:state.revision}));await new Promise(r=>setImmediate(r));
  assert.equal(message.command.action,'mic');assert.equal(message.command.muted,true);
  assert.equal((await relay.fetch(req('action',{button:'mic',muted:true,revision:state.revision}))).status,409);
  relay.webSocketMessage({},JSON.stringify({id:message.id,ok:true}));assert.equal(relay.pending.size,1);
  relay.webSocketMessage(socket,JSON.stringify({id:message.id,ok:true}));assert.equal((await action).status,200);
  assert.equal((await relay.fetch(req('action',{button:'mic',muted:true,revision:state.revision}))).status,409);
  relay.disconnect();
});
test('deck viewer routes require owner session and same-origin mutations',async()=>{
  let forwarded=0;
  const env={APP_ORIGIN:'https://panel.test',PRIVATE_DATA:{get:async()=>({sub:'owner',expires:Date.now()+10000})},GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',SESSION_SECRET:'test',ALLOWED_EMAIL:'owner@test',DECK_RELAY:{getByName:()=>({fetch:async()=>{forwarded++;return Response.json({ok:true});}})}};
  assert.equal((await worker.fetch(req('state'),env)).status,401);
  const headers={Cookie:`__Host-maison-session=${'a'.repeat(43)}`,Origin:'https://evil.test','Content-Type':'application/json'};
  assert.equal((await worker.fetch(new Request('https://panel.test/api/deck/action',{method:'POST',headers,body:'{}'}),env)).status,403);
  headers.Origin='https://panel.test';assert.equal((await worker.fetch(new Request('https://panel.test/api/deck/action',{method:'POST',headers,body:'{}'}),env)).status,200);assert.equal(forwarded,1);
});
test('failed commands forward only a short Lantern reason code',async t=>{
  const {relay,sockets,records}=setup(t);let message;
  const socket={readyState:1,send(raw){message=JSON.parse(raw);},close(){this.readyState=3;}};sockets.push(socket);
  records.set('mapping',{});
  const ask=async(reply)=>{
    const pending=relay.fetch(req('state'));await new Promise(r=>setImmediate(r));
    relay.webSocketMessage(socket,JSON.stringify({id:message.id,snapshot}));
    const {revision}=await (await pending).json();
    const action=relay.fetch(req('action',{button:'mic',muted:true,revision}));await new Promise(r=>setImmediate(r));
    relay.webSocketMessage(socket,JSON.stringify({id:message.id,...reply}));
    const response=await action;return {status:response.status,body:await response.json()};
  };
  assert.deepEqual(await ask({ok:false,error:'action_unconfirmed',reason:'control_disabled',message:'Live control is OFF'}),
    {status:409,body:{error:'action_unconfirmed',reason:'control_disabled'}});
  assert.deepEqual((await ask({ok:false,error:'<b>x</b>',reason:'Not A Code!'})).body,{error:'action_unconfirmed'});
  relay.disconnect();
});
