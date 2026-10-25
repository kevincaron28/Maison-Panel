import { CONFIG } from '../config.js';
import { initAppearance } from './appearance.js';
import { initLifecycle } from './lifecycle.js';
initAppearance(CONFIG); initLifecycle(CONFIG);

const $=id=>document.getElementById(id);
// The last good state stays on screen through one missed poll (e.g. the relay socket recycling),
// so tiles never blink to "unknown". Two failures in a row, or 10 s without news, clear it.
const STALE_MS=10000, LIVE_KEY='maison-deck:live-since';
let current=null, busy=false, polling=false, lastGood=0, failures=0, pending=null, optionsSignature='', pairExpiry=0;
const keys=[...document.querySelectorAll('[data-button]')];
const errors={sign_in_required:'Connectez-vous dans Réglages.',deck_unavailable:'Le relais Deck n’est pas encore disponible.',computer_unavailable:'PC inaccessible. Vérifiez Lantern Deck et Internet.',action_unconfirmed:'Action non confirmée. Vérifiez LIVE Studio avant de réessayer.',refresh_required:'État modifié. Actualisation en cours; réessayez ensuite.',action_pending:'Une autre commande est en cours.',incorrect_code:'Code incorrect.',pairing_expired:'Code expiré. Générez un nouveau code.',scene_not_linked:'Choisissez cette scène dans Configuration.',control_disabled:'Contrôle en direct désactivé dans Lantern Deck sur le PC.'};
// Specific causes reported by Lantern Deck 3 (relayed as `reason`).
const reasons={control_disabled:'Contrôle en direct désactivé dans Lantern Deck sur le PC.',scene_missing:'Cette scène n’existe plus dans LIVE Studio. Vérifiez Configuration.',studio_offline:'LIVE Studio n’est pas ouvert sur le PC.',busy:'Une autre action est en cours sur le PC.',rejected:'LIVE Studio a refusé l’action.',unconfirmed:'LIVE Studio n’a pas confirmé. Vérifiez le studio; rien n’a été renvoyé.',state_unverified:'Impossible de lire LIVE Studio. Rien n’a été envoyé.',command_expired:'Commande expirée en route. Réessayez.',duplicate_command:'Commande déjà reçue par le PC.'};
async function api(route,body) {
  const response=await fetch('/api/deck/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
    headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(14000)});
  let data;
  try {data=await response.json();} catch {throw new Error('Relais Maison indisponible. Réessayez après reconnexion.');}
  if(!response.ok) {const error=new Error(reasons[data.reason] || errors[data.error] || 'Commande indisponible. Actualisez et vérifiez le PC.');error.status=response.status;throw error;}
  return data;
}
const duration=ms=>{const s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(r).padStart(2,'0');};
function liveSince(){try{return Number(localStorage.getItem(LIVE_KEY))||0;}catch{return 0;}}
function trackLive(){
  // stream_status 0 = not live (verified on LIVE Studio 1.38.0); any other value is treated as live.
  try{
    if(current?.state?.stream_status && !liveSince())localStorage.setItem(LIVE_KEY,String(Date.now()));
    else if(current?.state && !current.state.stream_status)localStorage.removeItem(LIVE_KEY);
  }catch{/* storage blocked: timer just restarts */}
}
function pill(node,text,kind){node.hidden=!text;node.textContent=text||'';node.className='deck-pill'+(kind?' '+kind:'');}
function render() {
  const fresh=!!current?.connected && Date.now()-lastGood<STALE_MS;
  const enabled=fresh && current.enabled;
  const live=fresh && current.state.stream_status!==0;
  pill($('pill-studio'),fresh?'Studio connecté':current?.computer?'Ouvrez LIVE Studio sur le PC':current?'PC déconnecté':'Connexion…',fresh?'ok':'warn');
  pill($('pill-control'),fresh?(current.enabled?'Contrôle en direct actif':'Contrôle désactivé sur le PC'):'',fresh?(current.enabled?'ok strong':'warn'):'');
  pill($('pill-live'),live?'EN DIRECT'+(liveSince()?' · '+duration(Date.now()-liveSince()):''):'','live');
  for(const key of keys) {
    const id=key.dataset.button, audio=['mic','audio'].includes(id);
    const state=key.querySelector('.deck-key-state'), badge=key.querySelector('.key-badge'), emoji=key.querySelector('.key-emoji');
    key.classList.remove('active','muted','on');key.classList.toggle('pending',pending===id);
    key.removeAttribute('aria-pressed');delete key.dataset.muted;badge.hidden=true;if(emoji)emoji.hidden=true;
    if(audio) {
      key.disabled=!enabled;
      const name=id==='mic'?'Microphone':'Son du PC';
      if(!fresh){state.textContent='État inconnu';key.setAttribute('aria-label',name+', état inconnu');continue;}
      const muted=current.state[id+'_mute'];key.dataset.muted=String(muted);
      key.classList.add(muted?'muted':'on');badge.hidden=false;badge.textContent=muted?'COUPÉ':'ACTIF';if(emoji)emoji.hidden=!muted;
      state.textContent=muted?'Toucher pour activer':'Toucher pour couper';
      key.setAttribute('aria-label',name+(muted?', coupé. Toucher pour activer':', actif. Toucher pour couper'));
    } else {
      const name=current?.mapping?.[id], available=fresh && current.state.scenes.includes(name);
      key.disabled=!enabled || !available;
      if(!fresh) state.textContent='État inconnu';
      else if(!available) state.textContent='Scène à relier';
      else {
        const onAir=current.state.scene===name;
        state.textContent=name;key.setAttribute('aria-pressed',String(onAir));
        if(onAir){key.classList.add('active');badge.hidden=false;badge.textContent='ACTUELLE';}
      }
    }
  }
  $('deck-save').disabled=!fresh || busy;
  if(current) $('deck-status').textContent=!fresh?(current.computer?`${current.computer} · PC connecté, ouvrez LIVE Studio.`:'PC déconnecté. Ouvrez Lantern Deck sur le PC.'):
    `${current.computer} · ${current.enabled?'Connecté':'Contrôle désactivé sur le PC'} · ${live?'En direct':'Hors direct'}`;
}
function fillOptions() {
  const signature=JSON.stringify([current?.state?.scenes,current?.mapping]);if(signature===optionsSignature)return;optionsSignature=signature;
  for(const select of $('deck-mapping').querySelectorAll('select')) {
    const option=document.createElement('option');option.value='';option.textContent='Choisir une scène';select.replaceChildren(option);
    for(const name of current?.state?.scenes || []){const o=document.createElement('option');o.value=name;o.textContent=name;select.append(o);}
    select.value=current?.mapping?.[select.name] || '';
  }
}
async function refresh() {
  if(polling || busy || document.hidden)return;
  polling=true; // Background polls never change what the buttons look like.
  try {
    const data=await api('state');
    if(!data.connected && current?.connected && failures<1 && Date.now()-lastGood<STALE_MS) failures++; // Brief relay reconnect.
    else {current=data;lastGood=Date.now();failures=0;$('deck-login').hidden=true;fillOptions();trackLive();}
  }
  catch(error){
    if(error.status===401){current=null;lastGood=0;$('deck-login').hidden=false;$('deck-status').textContent=error.message;}
    else if(++failures>=2 || !current){current=null;lastGood=0;$('deck-status').textContent=error.message;}
  }
  finally{polling=false;render();}
}
function flash(key,cls){key.classList.add(cls);setTimeout(()=>key.classList.remove(cls),650);}
for(const key of keys) key.onclick=async()=>{
  if(key.disabled || busy || document.hidden)return;
  while(polling) await new Promise(r=>setTimeout(r,40)); // Wait for an in-flight poll instead of dropping the tap.
  if(busy || !current?.revision)return;
  const button=key.dataset.button, label=key.querySelector('strong').textContent;
  const body={button,revision:current.revision};
  if(['mic','audio'].includes(button))body.muted=!current.state[button+'_mute'];
  busy=true;pending=button;current.revision=null;render();
  if(navigator.vibrate)navigator.vibrate(12);
  $('deck-feedback').textContent='Vérification dans LIVE Studio…';
  let ok=false;
  try{await api('action',body);ok=true;$('deck-feedback').textContent='Action confirmée par LIVE Studio.';}
  catch(error){$('deck-feedback').textContent=error.message+' Aucun nouvel envoi automatique.';}
  finally{
    busy=false;pending=null;
    $('deck-last').textContent=(ok?'Fait : ':'Non effectué : ')+label;
    $('deck-last-time').textContent=new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    render();flash(key,ok?'flash':'shake');await refresh();
  }
};
$('deck-settings').onclick=()=>{const open=$('deck-setup').hidden;$('deck-setup').hidden=!open;$('deck-settings').setAttribute('aria-expanded',String(open));};
$('deck-pair').onclick=async()=>{
  $('deck-pair').disabled=true;
  try{const data=await api('pair',{});pairExpiry=data.expires;$('deck-pair-code').textContent=`Code : ${data.code} · valable 5 minutes. L’ancien PC sera déconnecté après jumelage.`;}
  catch(error){$('deck-pair-code').textContent=error.message;}
  finally{$('deck-pair').disabled=false;}
};
$('deck-revoke').onclick=async()=>{
  if(!confirm('Déconnecter le PC de ce deck? Il faudra le jumeler de nouveau.'))return;
  try{await api('revoke',{});current=null;pairExpiry=0;$('deck-pair-code').textContent='PC déconnecté.';await refresh();}
  catch(error){$('deck-feedback').textContent=error.message;}
};
$('deck-mapping').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const mapping=Object.fromEntries([...event.currentTarget.querySelectorAll('select')].map(s=>[s.name,s.value]));
  busy=true;render();
  try{await api('mapping',mapping);$('deck-feedback').textContent='Scènes reliées. Testez les boutons hors direct.';}
  catch(error){$('deck-feedback').textContent=error.message;}
  finally{busy=false;await refresh();}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){current=null;render();}else refresh();});
window.addEventListener('offline',()=>{current=null;render();$('deck-status').textContent='Maison est hors ligne. Commandes désactivées.';});
window.addEventListener('online',refresh);
setInterval(()=>{render();if(pairExpiry && Date.now()>pairExpiry){pairExpiry=0;$('deck-pair-code').textContent='Code expiré. Cliquez sur Connecter un PC.';}},1000);
setInterval(refresh,3000);refresh();
