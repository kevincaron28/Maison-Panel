import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const html=fs.readFileSync(new URL('../deck.html',import.meta.url),'utf8');
const code=fs.readFileSync(new URL('../js/deck.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('initAppearance(CONFIG); initLifecycle(CONFIG);','');
const flush=()=>new Promise(r=>setTimeout(r,10));
test('Deck renders only reported state, sends desired mute once, clears on disconnect',async t=>{
 const dom=new JSDOM(html,{url:'https://panel.test/deck.html',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document;let fail=false;const requests=[];
 let current={connected:true,enabled:true,computer:'Test PC',revision:'revision',mapping:{gaming:'Game'},state:{mic_mute:false,audio_mute:true,stream_status:0,scene:'Game',scenes:['Game','BRB']}};
 w.fetch=async(url,options)=>{requests.push({url,body:options.body});if(fail)throw Error('offline');if(url.endsWith('/action')){current.state.mic_mute=true;return{ok:true,json:async()=>({ok:true})}}return{ok:true,json:async()=>structuredClone(current)}};
 w.eval(code);await flush();
 const mic=d.querySelector('[data-button=mic]'),audio=d.querySelector('[data-button=audio]');
 assert.equal(mic.disabled,false);assert.equal(audio.dataset.muted,'true');assert.equal(d.querySelector('[data-button=starting]').disabled,true);
 assert.equal(d.querySelector('[data-button=gaming]').getAttribute('aria-pressed'),'true');
 mic.click();mic.click();await flush();
 const sent=requests.filter(r=>r.url.endsWith('/action'));assert.equal(sent.length,1);assert.deepEqual(JSON.parse(sent[0].body),{button:'mic',revision:'revision',muted:true});assert.equal(mic.dataset.muted,'true');
 fail=true;w.dispatchEvent(new w.Event('offline'));assert.equal(mic.disabled,true);assert.match(mic.textContent,/État inconnu/);
});
test('signed out deck remains disabled and offers the Maison sign-in route',async t=>{
 const dom=new JSDOM(html,{url:'https://panel.test/deck.html',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 dom.window.fetch=async()=>({ok:false,status:401,json:async()=>({error:'sign_in_required'})});dom.window.eval(code);await flush();
 assert.equal(dom.window.document.getElementById('deck-login').hidden,false);
 assert.ok([...dom.window.document.querySelectorAll('[data-button]')].every(b=>b.disabled));
});

test('Deck stays open during a stream while other detail pages retain idle return',async()=>{
 const vm=await import('node:vm');
 const source=fs.readFileSync(new URL('../js/lifecycle.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export function','function');
 let time=0,redirects=0;const callbacks=[];
 const context={Date:{now:()=>time},localStorage:{getItem:()=>5},setInterval:fn=>callbacks.push(fn),document:{body:{dataset:{page:'deck'}},hidden:false,activeElement:null,querySelector:()=>null,addEventListener(){}},location:{assign:()=>redirects++},window:{addEventListener(){}},navigator:{},syncReminders:()=>Promise.resolve()};
 vm.createContext(context);vm.runInContext(source+'\ninitLifecycle({});',context);time=6*60000;callbacks[0]();assert.equal(redirects,0);context.document.body.dataset.page='markets';callbacks[0]();assert.equal(redirects,1);
});

function deckDom(t, respond){
 const dom=new JSDOM(html,{url:'https://panel.test/deck.html',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 dom.window.fetch=respond;dom.window.eval(code);return dom;
}
const ok=data=>({ok:true,json:async()=>structuredClone(data)});
const baseState=()=>({connected:true,enabled:true,computer:'Studio PC',revision:'r1',mapping:{gaming:'Main',brb:'BRB'},state:{mic_mute:true,audio_mute:false,stream_status:0,scene:'Main',scenes:['Main','BRB']}});

test('mute state is unmistakable: emoji overlay and COUPÉ when muted, ACTIF when on, lit current scene',async t=>{
 const dom=deckDom(t,async()=>ok(baseState()));await flush();const d=dom.window.document;
 const mic=d.querySelector('[data-button=mic]'),audio=d.querySelector('[data-button=audio]'),gaming=d.querySelector('[data-button=gaming]');
 assert.ok(mic.classList.contains('muted'));assert.equal(mic.querySelector('.key-emoji').hidden,false);assert.equal(mic.querySelector('.key-badge').textContent,'COUPÉ');
 assert.match(mic.getAttribute('aria-label'),/coupé/);
 assert.ok(audio.classList.contains('on'));assert.equal(audio.querySelector('.key-emoji').hidden,true);assert.equal(audio.querySelector('.key-badge').textContent,'ACTIF');
 assert.ok(gaming.classList.contains('active'));assert.equal(gaming.querySelector('.key-badge').textContent,'ACTUELLE');
 assert.equal(d.getElementById('pill-control').textContent,'Contrôle en direct actif');assert.equal(d.getElementById('pill-live').hidden,true);
});

test('background polls never dim the keys and one failed poll keeps the state',async t=>{
 let hold=null,fail=false;
 const dom=deckDom(t,async()=>{if(fail)throw Error('relay recycling');if(hold)await hold;return ok(baseState());});await flush();
 const w=dom.window,d=w.document,mic=d.querySelector('[data-button=mic]');
 let release;hold=new Promise(r=>release=r);w.dispatchEvent(new w.Event('online'));await flush();
 assert.equal(mic.disabled,false,'keys stay enabled while a poll is in flight');hold=null;release();await flush();
 fail=true;w.dispatchEvent(new w.Event('online'));await flush();
 assert.equal(mic.disabled,false);assert.equal(mic.querySelector('.key-badge').textContent,'COUPÉ','one failure keeps the last state');
 w.dispatchEvent(new w.Event('online'));await flush();
 assert.equal(mic.disabled,true);assert.match(mic.textContent,/État inconnu/,'two failures clear it');
});

test('a brief relay reconnect (connected:false once) does not blank the tiles',async t=>{
 let disconnected=false;
 const dom=deckDom(t,async()=>ok(disconnected?{connected:false,enabled:false,computer:null,state:null,mapping:{},revision:null}:baseState()));await flush();
 const w=dom.window,mic=w.document.querySelector('[data-button=mic]');
 disconnected=true;w.dispatchEvent(new w.Event('online'));await flush();
 assert.equal(mic.querySelector('.key-badge').textContent,'COUPÉ');
 w.dispatchEvent(new w.Event('online'));await flush();
 assert.match(mic.textContent,/État inconnu/);
});

test('during a press only the pressed key pulses and the others keep their state; reasons are shown',async t=>{
 let finish;const actions=[];
 const dom=deckDom(t,async(url,options)=>{
  if(url.endsWith('/action')){actions.push(JSON.parse(options.body));await new Promise(r=>finish=r);return{ok:false,status:409,json:async()=>({error:'action_unconfirmed',reason:'control_disabled'})};}
  return ok(baseState());});await flush();
 const d=dom.window.document,mic=d.querySelector('[data-button=mic]'),gaming=d.querySelector('[data-button=gaming]');
 mic.click();await flush();
 assert.deepEqual(actions,[{button:'mic',revision:'r1',muted:false}]);
 assert.ok(mic.classList.contains('pending'));assert.ok(!gaming.classList.contains('pending'));
 assert.equal(gaming.querySelector('.key-badge').textContent,'ACTUELLE','other tiles keep their state');
 finish();await flush();await flush();
 assert.match(d.getElementById('deck-feedback').textContent,/Contrôle en direct désactivé dans Lantern Deck/);
 assert.match(d.getElementById('deck-last').textContent,/Non effectué : Microphone/);
});

test('LIVE pill shows a running timer while broadcasting',async t=>{
 const live=baseState();live.state.stream_status=2;
 const dom=deckDom(t,async()=>ok(live));
 dom.window.localStorage.setItem('maison-deck:live-since',String(Date.now()-3725000));await flush();
 assert.match(dom.window.document.getElementById('pill-live').textContent,/EN DIRECT · 1:02:0[56]/);
});
