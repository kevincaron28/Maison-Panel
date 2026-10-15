import { CONFIG } from '../config.js';
import { initAppearance } from './appearance.js';
import { initLifecycle } from './lifecycle.js';
initAppearance(CONFIG); initLifecycle(CONFIG);

const $=id=>document.getElementById(id);
let current=null, busy=false, polling=false, lastGood=0, optionsSignature='', pairExpiry=0;
const keys=[...document.querySelectorAll('[data-button]')];
const errors={sign_in_required:'Connectez-vous dans Réglages.',deck_unavailable:'Le relais Deck n’est pas encore disponible.',computer_unavailable:'PC inaccessible. Vérifiez Lantern Deck et Internet.',action_unconfirmed:'Action non confirmée. Vérifiez LIVE Studio avant de réessayer.',refresh_required:'État modifié. Actualisation en cours; réessayez ensuite.',incorrect_code:'Code incorrect.',pairing_expired:'Code expiré. Générez un nouveau code.',scene_not_linked:'Choisissez cette scène dans Configuration.',control_disabled:'Autorisez le contrôle dans Lantern Deck sur le PC.'};
async function api(route,body) {
  const response=await fetch('/api/deck/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
    headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(14000)});
  let data;
  try {data=await response.json();} catch {throw new Error('Relais Maison indisponible. Réessayez après reconnexion.');}
  if(!response.ok) {const error=new Error(errors[data.error] || 'Commande indisponible. Actualisez et vérifiez le PC.');error.status=response.status;throw error;}
  return data;
}
function render() {
  const fresh=current?.connected && Date.now()-lastGood<6500;
  const ready=fresh && current.enabled && !busy && !polling;
  for(const key of keys) {
    const id=key.dataset.button, audio=['mic','audio'].includes(id);
    const state=key.querySelector('.deck-key-state');
    key.removeAttribute('aria-pressed');delete key.dataset.muted;
    if(audio) {
      key.disabled=!ready;
      if(!fresh){state.textContent='État inconnu';key.removeAttribute('aria-label');continue;}
      const muted=current.state[id+'_mute'];key.dataset.muted=String(muted);
      state.textContent=muted?'Coupé · toucher pour activer':'Actif · toucher pour couper';
      key.setAttribute('aria-label',(id==='mic'?'Microphone':'Son du PC')+', '+state.textContent);
    } else {
      const name=current?.mapping?.[id], available=fresh && current.state.scenes.includes(name);
      key.disabled=!ready || !available;
      if(!fresh) state.textContent='État inconnu';
      else if(!available) state.textContent='Scène à relier';
      else {state.textContent=(current.state.scene===name?'À l’écran · ':'')+name;key.setAttribute('aria-pressed',String(current.state.scene===name));}
    }
  }
  $('deck-save').disabled=!fresh || busy;
  if(current) $('deck-status').textContent=!fresh?(current.computer?`${current.computer} · PC connecté, ouvrez LIVE Studio.`:'PC déconnecté. Ouvrez Lantern Deck sur le PC.'):
    `${current.computer} · ${current.enabled?'Connecté':'Contrôle désactivé sur le PC'} · ${current.state.stream_status===2?'En direct':current.state.stream_status===1?'Direct en pause':'Hors direct'}`;
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
  polling=true;
  render();
  try {current=await api('state');lastGood=Date.now();$('deck-login').hidden=true;fillOptions();}
  catch(error){current=null;lastGood=0;$('deck-login').hidden=error.status!==401;$('deck-status').textContent=error.message;}
  finally{polling=false;render();}
}
for(const key of keys) key.onclick=async()=>{
  if(key.disabled || busy || polling || !current?.revision || document.hidden)return;
  const button=key.dataset.button;
  const body={button,revision:current.revision};
  if(['mic','audio'].includes(button))body.muted=!current.state[button+'_mute'];
  busy=true;render();$('deck-feedback').textContent='Vérification dans LIVE Studio…';
  try{await api('action',body);$('deck-feedback').textContent='Action confirmée par LIVE Studio.';}
  catch(error){$('deck-feedback').textContent=error.message+' Aucun nouvel envoi automatique.';}
  finally{busy=false;current=null;render();await refresh();}
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
