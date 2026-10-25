import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { CameraRelay } from "../worker/camera-relay.js";

test("camera relay rejects anonymous viewers and invalid publishers", async () => {
  const env={APP_ORIGIN:"https://panel.test",PRIVATE_DATA:{get:async()=>null},GOOGLE_CLIENT_ID:"test",GOOGLE_CLIENT_SECRET:"test",SESSION_SECRET:"test",ALLOWED_EMAIL:"owner@test",CAMERA_BRIDGE_SECRET:"publisher-secret",CAMERA_RELAY:{getByName(){throw new Error("Must not forward");}}};
  for(const path of ["snapshot","publisher"]) {
    const response=await worker.fetch(new Request(`https://panel.test/api/camera/${path}`),env);
    assert.equal(response.status,401); assert.match(response.headers.get("cache-control"),/no-store/);
  }
  const response=await worker.fetch(new Request("https://panel.test/api/camera/snapshot",{headers:{Authorization:"Bearer publisher-secret"}}),env);
  assert.equal(response.status,401,"publisher credential cannot view private footage");
});
test("signed-in viewer reaches relay; publisher secret only reaches publisher route",async()=>{
  const token="a".repeat(43);
  const env={APP_ORIGIN:"https://panel.test",PRIVATE_DATA:{get:async()=>({sub:"owner",expires:Date.now()+10000})},GOOGLE_CLIENT_ID:"test",GOOGLE_CLIENT_SECRET:"test",SESSION_SECRET:"test",ALLOWED_EMAIL:"owner@test",CAMERA_BRIDGE_SECRET:"publisher-secret",CAMERA_RELAY:{getByName(){return {fetch:async()=>new Response("forwarded")};}}};
  const viewer=await worker.fetch(new Request("https://panel.test/api/camera/snapshot",{headers:{Cookie:`__Host-maison-session=${token}`}}),env);
  assert.equal(await viewer.text(),"forwarded");
  const publisher=await worker.fetch(new Request("https://panel.test/api/camera/publisher",{headers:{Authorization:"Bearer publisher-secret"}}),env);
  assert.equal(await publisher.text(),"forwarded");
});
test("relay coalesces viewers, validates frames and never persists them",async t=>{
  const original=globalThis.WebSocketRequestResponsePair;
  globalThis.WebSocketRequestResponsePair=class {};
  t.after(()=>{if(original===undefined)delete globalThis.WebSocketRequestResponsePair;else globalThis.WebSocketRequestResponsePair=original;});
  let command;
  const socket={readyState:1,send:raw=>{command=JSON.parse(raw);}};
  const relay=new CameraRelay({setWebSocketAutoResponse(){},getWebSockets:()=>[socket]});
  const request=new Request("https://panel.test/api/camera/snapshot");
  const first=relay.fetch(request),second=relay.fetch(request);
  relay.webSocketMessage(socket,JSON.stringify({id:command.id,jpeg:Buffer.from([255,216,0,255,217]).toString("base64")}));
  for(const promise of [first,second]) { const response=await promise;assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,5);assert.match(response.headers.get("cache-control"),/no-store/); }
  assert.equal(relay.pending,null);
  const bad=relay.fetch(request);
  relay.webSocketMessage(socket,JSON.stringify({id:command.id,jpeg:"YWJj"}));
  assert.equal((await bad).status,503);
});

test('camera controls require owner session and same-origin JSON, with fixed actions only', async()=>{
  let forwarded = 0;
  const env={APP_ORIGIN:'https://panel.test',PRIVATE_DATA:{get:async()=>({sub:'owner',expires:Date.now()+10000})},GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',SESSION_SECRET:'test',ALLOWED_EMAIL:'owner@test',CAMERA_RELAY:{getByName:()=>({fetch:async()=>{forwarded++;return Response.json({ok:true});}})}};
  const send=(action,headers={})=>worker.fetch(new Request('https://panel.test/api/camera/control',{method:'POST',headers:{Origin:'https://panel.test','Content-Type':'application/json',...headers},body:JSON.stringify({action})}),env);
  assert.equal((await send('left')).status,401);
  const cookie={Cookie:`__Host-maison-session=${'a'.repeat(43)}`};
  assert.equal((await send('left',{...cookie,Origin:'https://evil.test'})).status,403);
  assert.equal((await send('reboot',cookie)).status,400);
  assert.equal((await send('left',cookie)).status,200);
  assert.equal(forwarded,1);
});

test('relay serializes motion and resolves only matching control acknowledgements',async t=>{
  const original=globalThis.WebSocketRequestResponsePair;
  globalThis.WebSocketRequestResponsePair=class {};
  t.after(()=>{globalThis.WebSocketRequestResponsePair=original;});
  let command;
  const socket={readyState:1,send:raw=>command=JSON.parse(raw)};
  const relay=new CameraRelay({setWebSocketAutoResponse(){},getWebSockets:()=>[socket]});
  const request=()=>new Request('https://panel.test/api/camera/control',{method:'POST',body:JSON.stringify({action:'left'})});
  const first=relay.fetch(request());
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(command.action,'left');
  assert.equal((await relay.fetch(request())).status,409);
  relay.webSocketMessage(socket,JSON.stringify({id:command.id,ok:true}));
  assert.equal((await first).status,200);
  assert.equal(relay.controls.size,0);
});

test('relay tells the viewer why the camera is unavailable',async t=>{
  const original=globalThis.WebSocketRequestResponsePair;
  globalThis.WebSocketRequestResponsePair=class {};
  t.after(()=>{globalThis.WebSocketRequestResponsePair=original;});
  const reasonOf=async response=>{assert.equal(response.status,503);return (await response.json()).error;};
  const request=new Request('https://panel.test/api/camera/snapshot');
  const empty=new CameraRelay({setWebSocketAutoResponse(){},getWebSockets:()=>[]});
  assert.equal(await reasonOf(await empty.fetch(request)),'pc_offline');
  let command;
  const socket={readyState:1,send:raw=>{command=JSON.parse(raw);}};
  const relay=new CameraRelay({setWebSocketAutoResponse(){},getWebSockets:()=>[socket]});
  let pending=relay.fetch(request);
  relay.webSocketMessage(socket,JSON.stringify({id:command.id,error:'busy'}));
  assert.equal(await reasonOf(await pending),'camera_busy');
  assert.equal(relay.cameraState,'unknown','a busy bridge does not mean the camera is down');
  pending=relay.fetch(request);
  relay.webSocketMessage(socket,JSON.stringify({id:command.id,error:true}));
  assert.equal(await reasonOf(await pending),'camera_unreachable');
  relay.webSocketMessage(socket,JSON.stringify({type:'status',camera:'ok'}));
  assert.equal(relay.cameraState,'ok');
  pending=relay.fetch(request);
  relay.webSocketClose(socket);
  assert.equal(await reasonOf(await pending),'pc_offline');
});
