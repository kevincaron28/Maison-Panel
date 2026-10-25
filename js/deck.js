import { CONFIG } from '../config.js';
import { initAppearance } from './appearance.js';
import { initLifecycle } from './lifecycle.js';
initAppearance(CONFIG); initLifecycle(CONFIG);

const $=id=>document.getElementById(id);
// The last good state stays on screen through one missed poll (e.g. the relay socket recycling),
// so tiles never blink to "unknown". Two failures in a row, or 10 s without news, clear it.
const STALE_MS=10000, LIVE_KEY='maison-deck:live-since';
let current=null, busy=false, polling=false, lastGood=0, failures=0, pending=null, optionsSignature='', pairExpiry=0, layout='';
const errors={sign_in_required:'Connectez-vous dans Réglages.',deck_unavailable:'Le relais Deck n’est pas encore disponible.',computer_unavailable:'PC inaccessible. Vérifiez Lantern Deck et Internet.',action_unconfirmed:'Action non confirmée. Vérifiez LIVE Studio avant de réessayer.',refresh_required:'État modifié. Actualisation en cours; réessayez ensuite.',action_pending:'Une autre commande est en cours.',incorrect_code:'Code incorrect.',pairing_expired:'Code expiré. Générez un nouveau code.',scene_not_linked:'Choisissez cette scène dans Configuration.',control_disabled:'Contrôle en direct désactivé dans Lantern Deck sur le PC.'};
// Specific causes reported by Lantern Deck 3 (relayed as `reason`).
const reasons={control_disabled:'Contrôle en direct désactivé dans Lantern Deck sur le PC.',scene_missing:'Cette scène n’existe plus dans LIVE Studio. Vérifiez le bouton dans Lantern Deck.',studio_offline:'LIVE Studio n’est pas ouvert sur le PC.',busy:'Une autre action est en cours sur le PC.',rejected:'LIVE Studio a refusé l’action.',unconfirmed:'LIVE Studio n’a pas confirmé. Vérifiez le studio; rien n’a été renvoyé.',state_unverified:'Impossible de lire LIVE Studio. Rien n’a été envoyé.',command_expired:'Commande expirée en route. Réessayez.',duplicate_command:'Commande déjà reçue par le PC.',macro_failed:'Certaines étapes n’ont pas fonctionné. Vérifiez LIVE Studio.',unassigned:'Ce bouton n’est pas configuré dans Lantern Deck.',unknown_button:'Ce bouton a changé. Actualisation en cours.',cooldown:'Un instant avant d’appuyer de nouveau.'};
const ICONS={'01':'M3 4h18v13H3z M8 21h8 M12 17v4 M9 8l6 3-6 3z','02':'M3 6h12v12H3z M15 10l6-4v12l-6-4','03':'M9 4v7H4 M4 10a8 8 0 1 1 1 8 M12 8v5l3 2','04':'M5 21V4 M5 4h11l-2 4 2 4H5','♫':'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8','♪':'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11','▧':'M3 4h18v14H3z M3 8h18 M7 12h5v3H7z M16 12h2 M16 15h2','✦':'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z'};
// Lantern Deck 2.x publishes no buttons: the classic six, with scenes chosen in Configuration.
const LEGACY=[['starting','Début','01','#80a7ff','scene'],['gaming','Jeu principal','02','#4dd9b1','scene'],['brb','Pause · BRB','03','#d3acff','scene'],['ending','Fin','04','#ff8f9e','scene'],['mic','Microphone','♫','#f4b66c','mic'],['audio','Son du PC','♪','#7dd4e8','audio']];
const deckMode=()=>Array.isArray(current?.deck);
function model(){
  if(deckMode())return current.deck;
  return LEGACY.map(([id,label,icon,color,kind])=>({id,label,icon,color,legacy:true,confirm:false,action:kind==='scene'?{kind,scene:current?.mapping?.[id]||''}:{kind}}));
}
async function api(route,body) {
  const response=await fetch('/api/deck/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
    headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(route==='action'?35000:14000)});
  let data;
  try {data=await response.json();} catch {throw new Error('Relais Maison indisponible. Réessayez après reconnexion.');}
  if(!response.ok) {const error=new Error(reasons[data.reason] || errors[data.error] || 'Commande indisponible. Actualisez et vérifiez le PC.');error.status=response.status;error.reason=data.reason;throw error;}
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
function iconNode(value,muteable){
  const wrap=document.createElement('span');wrap.className='key-icon';wrap.setAttribute('aria-hidden','true');
  if(ICONS[value]){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');
    const path=document.createElementNS(ns,'path');path.setAttribute('d',ICONS[value]);svg.append(path);
    if(muteable){const slash=document.createElementNS(ns,'path');slash.setAttribute('class','mute-slash');slash.setAttribute('d','M3 3l18 18');svg.append(slash);}
    wrap.append(svg);
  } else {wrap.classList.add('text-icon');wrap.textContent=value;}
  return wrap;
}
function build(){
  const buttons=model(), signature=JSON.stringify(buttons.map(b=>[b.id,b.label,b.icon,b.color,b.action.kind]));
  if(signature===layout)return;layout=signature;
  const grid=$('deck-grid');grid.replaceChildren();
  for(const b of buttons){
    const key=document.createElement('button');key.type='button';key.className='studio-key';key.dataset.button=b.id;key.dataset.kind=b.action.kind;
    key.style.setProperty('--accent',b.color);
    const audio=['mic','audio'].includes(b.action.kind);
    const badge=document.createElement('span');badge.className='key-badge';badge.hidden=true;key.append(badge);
    if(audio){const emoji=document.createElement('span');emoji.className='key-emoji';emoji.setAttribute('aria-hidden','true');emoji.hidden=true;emoji.textContent='🔇';key.append(emoji);}
    const label=document.createElement('strong');label.textContent=b.label;
    const state=document.createElement('span');state.className='deck-key-state';
    key.append(iconNode(b.icon,audio),label,state);
    key.onclick=()=>press(key);
    grid.append(key);
  }
  $('deck-mapping').hidden=deckMode();$('deck-mode-note').hidden=!deckMode();
}
function reached(step,s){return step.kind==='scene'?s.scene===step.scene:step.kind==='wait'||s[step.kind+'_mute']===step.muted;}
function render() {
  build();
  const fresh=!!current?.connected && Date.now()-lastGood<STALE_MS;
  const enabled=fresh && current.enabled;
  const live=fresh && current.state.stream_status!==0;
  pill($('pill-studio'),fresh?'Studio connecté':current?.computer?'Ouvrez LIVE Studio sur le PC':current?'PC déconnecté':'Connexion…',fresh?'ok':'warn');
  pill($('pill-control'),fresh?(current.enabled?'Contrôle en direct actif':'Contrôle désactivé sur le PC'):'',fresh?(current.enabled?'ok strong':'warn'):'');
  pill($('pill-live'),live?'EN DIRECT'+(liveSince()?' · '+duration(Date.now()-liveSince()):''):'','live');
  const buttons=Object.fromEntries(model().map(b=>[b.id,b]));
  for(const key of $('deck-grid').children) {
    const b=buttons[key.dataset.button];if(!b)continue;
    const kind=b.action.kind, state=key.querySelector('.deck-key-state'), badge=key.querySelector('.key-badge'), emoji=key.querySelector('.key-emoji');
    key.classList.remove('active','muted','on');key.classList.toggle('pending',pending===b.id);
    key.removeAttribute('aria-pressed');delete key.dataset.muted;badge.hidden=true;if(emoji)emoji.hidden=true;
    const show=(text,cls)=>{badge.hidden=false;badge.textContent=text;if(cls)key.classList.add(cls);};
    if(kind==='mic'||kind==='audio') {
      key.disabled=!enabled;
      const name=b.label;
      if(!fresh){state.textContent='État inconnu';key.setAttribute('aria-label',name+', état inconnu');continue;}
      const muted=current.state[kind+'_mute'];key.dataset.muted=String(muted);
      show(muted?'COUPÉ':'ACTIF',muted?'muted':'on');if(emoji)emoji.hidden=!muted;
      state.textContent=muted?'Toucher pour activer':'Toucher pour couper';
      key.setAttribute('aria-label',name+(muted?', coupé. Toucher pour activer':', actif. Toucher pour couper'));
    } else if(kind==='scene') {
      const scene=b.action.scene, available=fresh && current.state.scenes.includes(scene);
      key.disabled=!enabled || !available;
      if(!fresh) state.textContent='État inconnu';
      else if(!available) state.textContent=b.legacy?'Scène à relier':'Scène introuvable';
      else {
        const onAir=current.state.scene===scene;
        state.textContent=scene;key.setAttribute('aria-pressed',String(onAir));
        if(onAir)show('ACTUELLE','active');
      }
    } else if(kind==='macro') {
      key.disabled=!enabled;
      state.textContent=b.action.steps.length+' étapes';
      if(fresh && b.action.steps.every(step=>reached(step,current.state)))show('EN PLACE','active');
    } else {
      key.disabled=!enabled;state.textContent='Raccourci clavier';
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
async function press(key,confirmed=false){
  if(key.disabled || busy || document.hidden)return;
  while(polling) await new Promise(r=>setTimeout(r,40)); // Wait for an in-flight poll instead of dropping the tap.
  const b=model().find(item=>item.id===key.dataset.button);
  if(busy || !b || !current?.revision)return;
  if(b.confirm && !confirmed && !confirm(`Lancer « ${b.label} » ?`))return;
  const kind=b.action.kind, muteable=kind==='mic'||kind==='audio';
  const body=b.legacy?{button:b.id,revision:current.revision}:{press:b.id,revision:current.revision,confirmed:confirmed||b.confirm};
  if(muteable)body[b.legacy?'muted':'target']=!current.state[kind+'_mute'];
  busy=true;pending=b.id;current.revision=null;render();
  if(navigator.vibrate)navigator.vibrate(12);
  $('deck-feedback').textContent='Vérification dans LIVE Studio…';
  let ok=false,ask=false;
  try{
    const result=await api('action',body);ok=true;
    $('deck-feedback').textContent=result?.result?.code==='already'?'Déjà en place dans LIVE Studio.':'Action confirmée par LIVE Studio.';
  }
  catch(error){
    ask=['confirm_live','confirm'].includes(error.reason) && !confirmed;
    $('deck-feedback').textContent=ask?'Confirmation demandée.':error.message+' Aucun nouvel envoi automatique.';
  }
  finally{
    busy=false;pending=null;
    if(!ask){
      $('deck-last').textContent=(ok?'Fait : ':'Non effectué : ')+b.label;
      $('deck-last-time').textContent=new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
    render();if(!ask)flash(key,ok?'flash':'shake');await refresh();
  }
  if(ask){
    const question=`Vous êtes EN DIRECT. Lancer « ${b.label} » maintenant ?`;
    const fresh=[...$('deck-grid').children].find(k=>k.dataset.button===b.id);
    if(confirm(question) && fresh)await press(fresh,true);
  }
}
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
setInterval(refresh,3000);render();refresh();
