import { zonedParts } from './runtime.js';
import { loadCache, saveCache } from './store.js';
import { weatherCacheKey, weatherLabel } from './weather.js';
import { ECONOMIC_EVENTS, ECONOMIC_VALID_UNTIL } from './economic-events.js';

export function morningDue(now, lastDay, timezone = 'America/Toronto') {
  const { day, hour } = zonedParts(now, timezone);
  return hour >= 7 && hour < 11 && lastDay !== day;
}

export function forecastBrief(cached, day, now = Date.now(), locale = 'fr-CA') {
  const english = locale.startsWith('en');
  const daily = cached?.data?.daily;
  const i = daily?.time?.indexOf(day) ?? -1;
  if (i < 0 || now - cached.fetchedAt > 6 * 3600000) return english ? 'The forecast is currently unavailable.' : 'Prévisions indisponibles pour le moment.';
  const value = key => Number.isFinite(daily[key]?.[i]) ? Math.round(daily[key][i]) : null;
  const high = value('temperature_2m_max'), low = value('temperature_2m_min');
  if (high === null || low === null) return english ? 'The forecast is currently incomplete.' : 'Prévisions incomplètes pour le moment.';
  const rain = value('precipitation_probability_max'), wind = value('wind_speed_10m_max');
  if (english) return `${weatherLabel(daily.weather_code?.[i], 'en-CA') || 'Today'}. A high of ${high} degrees Celsius and a low of ${low}.${rain === null ? '' : ` A ${rain} percent chance of precipitation.`}${wind === null ? '' : ` Winds up to ${wind} kilometres per hour.`}`;
  return `${weatherLabel(daily.weather_code?.[i], 'fr-CA') || 'Aujourd’hui'}. Maximum ${high} degrés, minimum ${low} degrés.${rain === null ? '' : ` Risque de précipitations : ${rain} pour cent.`}${wind === null ? '' : ` Vent jusqu’à ${wind} kilomètres à l’heure.`}`;
}

export function spokenEconomy(day) {
  const { events } = economicBrief(day);
  if (day > ECONOMIC_VALID_UNTIL) return 'The economic calendar needs updating; its scheduled dates have expired.';
  if (!events.length) return 'No events in our selected calendar today. This is not a complete economic calendar.';
  const names = { 'inflation IPC': 'consumer price inflation', 'prix à la production': 'producer prices', 'perspectives des entreprises': 'business outlook survey', 'décision de taux': 'interest rate decision', 'décision de la Fed': 'Federal Reserve rate decision', 'emploi': 'employment report' };
  return events.map(e => {
    const [country, title] = e.title.split(' · ');
    const time = e.time ? new Date(`${day}T${e.time}:00Z`).toLocaleTimeString('en-CA', {timeZone:'UTC',hour:'numeric',minute:'2-digit'}) + ', Toronto time' : 'Time to be confirmed';
    return `${time}. ${country === 'États-Unis' ? 'United States' : 'Canada'}, ${names[title] || 'economic release'}.`;
  }).join(' ') + ' These are selected official Canadian and U.S. events.';
}

export function economicBrief(day) {
  if (day > ECONOMIC_VALID_UNTIL) return { events: [], note: 'Calendrier à actualiser : les dates suivies ont expiré.' };
  const events = ECONOMIC_EVENTS.filter(e => e.date === day);
  return { events, note: events.length ? 'Sélection officielle Canada / États-Unis · heure de Toronto' : 'Aucun événement dans notre sélection aujourd’hui. Le calendrier suivi n’est pas exhaustif.' };
}

export function initMorning(config, root) {
  const dialog = document.createElement('dialog');
  dialog.id = 'morning-dialog';
  dialog.setAttribute('aria-labelledby', 'morning-title');
  dialog.innerHTML = `<div class="section-heading"><div><p class="section-label">Votre rendez-vous de 7 h</p><h2 id="morning-title">Bonjour, famille Caron.</h2></div><button id="morning-close" type="button">Fermer</button></div>
    <p id="morning-date"></p><div class="morning-grid"><section><h3>Aujourd’hui à ${config.location.label}</h3><p id="morning-weather"></p><small>Open-Meteo</small></section><section><h3>Dernière séance boursière</h3><div id="morning-markets"></div><small>FNB repères · variation à la clôture · Yahoo Finance</small></section><section><h3>Économie du jour</h3><div id="morning-events"></div><small id="morning-economic-note"></small></section></div>
    <div class="morning-actions"><button id="morning-play" type="button">Écouter le bulletin</button><button id="morning-stop" type="button">Arrêter</button><label><input id="morning-voice" type="checkbox"> Voix automatique à 7 h</label></div><p id="morning-status" role="status"></p><p class="morning-help">Gardez le panneau ouvert et la tablette éveillée. Ouverture au réveil avant 11 h si le rendez-vous a été manqué. La voix s’active sur chaque appareil et peut nécessiter un nouveau toucher après un redémarrage.</p>`;
  root.append(dialog);
  const q = id => dialog.querySelector(`#morning-${id}`);
  const read = key => { try { return localStorage.getItem(`maison-panel:morning-${key}`); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(`maison-panel:morning-${key}`, value); } catch {} };
  let weather = loadCache(weatherCacheKey(config));
  let markets = loadCache('morning-markets')?.data;
  let speech = '', lastDay = read('day'), loading = false;
  const voice = q('voice');
  voice.checked = read('voice') === 'yes';
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  if (!supported) {
    voice.disabled = q('play').disabled = q('stop').disabled = true;
    q('status').textContent = 'La lecture vocale n’est pas disponible dans ce navigateur.';
  }
  function stop() { if (supported) window.speechSynthesis.cancel(); }
  function speak(text) {
    if (!supported) return;
    stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-CA'; utterance.rate = 0.95;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(v => v.lang === 'en-CA') || voices.find(v => v.lang.startsWith('en')) || null;
    utterance.onstart = () => q('status').textContent = 'Lecture du bulletin…';
    utterance.onend = () => q('status').textContent = 'Bonne journée !';
    utterance.onerror = e => { if (!['canceled','interrupted'].includes(e.error)) q('status').textContent = 'Lecture bloquée. Touchez « Écouter le bulletin » et vérifiez le volume de la tablette.'; };
    q('status').textContent = 'Si la lecture ne démarre pas, touchez « Écouter le bulletin ».';
    window.speechSynthesis.speak(utterance);
  }
  function render() {
    const now = new Date(), { day } = zonedParts(now, config.timezone);
    q('date').textContent = now.toLocaleDateString('fr-CA', { timeZone: config.timezone, weekday: 'long', day: 'numeric', month: 'long' });
    const forecast = forecastBrief(weather, day);
    q('weather').textContent = forecast;
    const marketText = [];
    q('markets').replaceChildren();
    const dates = new Set((markets?.today === day ? markets.rows || [] : []).filter(r => !r.unavailable).map(r => r.date));
    const commonDate = dates.size === 1 ? [...dates][0] : null;
    if (commonDate) {
      const date = document.createElement('p');
      date.className = 'morning-session'; date.textContent = `Séance du ${commonDate}`;
      q('markets').append(date);
    }
    for (const benchmark of config.markets.symbols) {
      const row = markets?.today === day ? markets.rows?.find(r => r.symbol === benchmark.sym) : null;
      const item = document.createElement('p');
      if (row && !row.unavailable && Number.isFinite(row.change)) {
        const change = `${row.change >= 0 ? '+' : ''}${row.change.toFixed(2).replace('.', ',')} %`;
        const link = document.createElement('a'); link.href = `https://finance.yahoo.com/quote/${benchmark.sym}/history/`;
        link.textContent = `${benchmark.label} · ${benchmark.sym} : ${change}`;
        item.append(link);
        if (!commonDate) item.append(document.createElement('br'), document.createTextNode(`Séance du ${row.date}`));
        const sessionDate = new Date(`${row.date}T12:00:00Z`).toLocaleDateString('en-CA', {timeZone:'UTC',month:'long',day:'numeric'});
        marketText.push(`${benchmark.label}, for the ${sessionDate} session, ${row.change >= 0 ? 'up' : 'down'} ${Math.abs(row.change).toFixed(2)} percent.`);
      } else { item.textContent = `${benchmark.label} : indisponible`; marketText.push(`${benchmark.label}, data unavailable.`); }
      q('markets').append(item);
    }
    const economy = economicBrief(day);
    q('events').replaceChildren(); q('economic-note').textContent = economy.note;
    for (const event of economy.events) {
      const p = document.createElement('p'), a = document.createElement('a');
      a.href = event.source; a.textContent = `${event.time || 'Heure à confirmer'} · ${event.title}`;
      p.append(a); q('events').append(p);
    }
    speech = `Good morning, Caron family. Here is your morning briefing. In ${config.location.label}, ${forecastBrief(weather, day, Date.now(), 'en-CA')} For the markets, our benchmark ETFs: ${marketText.join(' ')} Today's economic events. ${spokenEconomy(day)} Have a wonderful day!`;
  }
  async function refreshMarkets() {
    try {
      const response = await fetch('/api/morning-markets', { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (!Array.isArray(data.rows)) throw new Error('Invalid data');
      markets = data; saveCache('morning-markets', markets);
    } catch { /* The dated cache remains available; render rejects yesterday's bulletin. */ }
  }
  async function open(auto = false) {
    if (loading) return;
    lastDay = zonedParts(new Date(), config.timezone).day;
    write('day', lastDay);
    loading = true; render();
    if (!dialog.open) dialog.showModal();
    q('play').disabled = true;
    await refreshMarkets(); render(); q('play').disabled = !supported; loading = false;
    if (auto && dialog.open && voice.checked) speak(speech);
  }
  q('close').onclick = () => dialog.close();
  dialog.addEventListener('close', stop);
  q('stop').onclick = () => { stop(); q('status').textContent = 'Lecture arrêtée.'; };
  q('play').onclick = () => { render(); speak(speech); };
  voice.onchange = () => { write('voice', voice.checked ? 'yes' : 'no'); if (voice.checked) speak('Good morning, Caron family. Your morning briefing voice is now enabled in English on this tablet.'); else stop(); };
  document.getElementById('morning-open').onclick = () => open();
  document.addEventListener('maison-weather', e => { weather = { data: e.detail.data, fetchedAt: e.detail.meta.fetchedAt }; if (dialog.open) render(); });
  function check() {
    if (document.hidden || document.querySelector('dialog[open]') || !morningDue(new Date(), lastDay, config.timezone)) return;
    lastDay = zonedParts(new Date(), config.timezone).day;
    write('day', lastDay); open(true);
  }
  setInterval(check, 15000);
  document.addEventListener('visibilitychange', check);
  setTimeout(check, 5000);
}
