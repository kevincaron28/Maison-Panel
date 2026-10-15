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
