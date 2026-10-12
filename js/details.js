import { CONFIG } from "../config.js";
import { initAppearance } from "./appearance.js";
import { initMarkets } from "./markets.js";
import { initSolunar } from "./solunar.js";
import { initWeather } from "./weather.js";
import { zonedParts } from "./runtime.js";
import { initAlerts } from "./alerts.js";
import { ECONOMIC_EVENTS } from "./economic-events.js";

const page = document.body.dataset.page;
document.querySelector(`.home-nav a[href="${page}.html"]`)?.setAttribute("aria-current", "page");
initAppearance(CONFIG);
initAlerts(CONFIG, document.getElementById("daily-alerts"));
function network() {
  document.getElementById("detail-network").textContent = navigator.onLine ? "" : "Hors ligne · les cours nécessitent Internet; les données météo peuvent être anciennes.";
}
window.addEventListener("online", network);
window.addEventListener("offline", network);
network();
function start(name, action) {
  try { action(); } catch (error) {
    console.warn(`[${name}]`, error);
    const message = document.createElement("p");
    message.textContent = `${name} indisponible · rechargez la page pour réessayer.`;
    document.querySelector("main").prepend(message);
  }
}
if (page === "markets") {
  const upcoming = document.getElementById("economic-upcoming");
  for (const event of ECONOMIC_EVENTS.filter(e=>e.date >= zonedParts(new Date(),CONFIG.timezone).day)) {
    const row = document.createElement("li");
    const link = document.createElement("a");
    link.href = event.source; link.target = "_blank"; link.rel = "noopener";
    link.textContent = `${event.date} · ${event.time || "heure à confirmer"} · ${event.title}`;
    row.append(link); upcoming.append(row);
  }
  if (!upcoming.children.length) upcoming.textContent = "Sélection à actualiser. Consultez le calendrier en ligne ci-dessous.";
  const calendar = document.createElement("iframe");
  calendar.title = "Calendrier économique TradingView";
  calendar.className = "economic-widget";
  calendar.setAttribute("sandbox","allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
  function updateCalendar() {
    const colorTheme = document.documentElement.dataset.theme === "paper" ? "light" : "dark";
    if (calendar.dataset.theme === colorTheme) return;
    calendar.dataset.theme = colorTheme;
    calendar.src = "https://www.tradingview-widget.com/embed-widget/events/?locale=fr#" + encodeURIComponent(JSON.stringify({width:"100%",height:550,colorTheme,isTransparent:false,importanceFilter:"0,1",currencyFilter:"USD,CAD"}));
  }
  updateCalendar();
  new MutationObserver(updateCalendar).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  document.getElementById("economic-embed").append(calendar);
  start("Marchés", () => initMarkets(CONFIG, document.getElementById("tile-markets")));
  function clock() {
    document.getElementById("market-clock").textContent = new Intl.DateTimeFormat("fr-CA", {
      timeZone:"America/New_York", weekday:"long",hour:"2-digit",minute:"2-digit",
    }).format(new Date()) + " · New York";
  }
  clock(); setInterval(clock, 30000);
} else {
  start("Pêche", () => initSolunar(CONFIG, document.getElementById("tile-solunar")));
  start("Météo", () => initWeather(CONFIG, document.getElementById("tile-weather")));
  document.getElementById("forecast-toggle").addEventListener("click", event => {
    const days = document.getElementById("forecast-days");
    days.hidden = !days.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!days.hidden));
    event.currentTarget.textContent = days.hidden ? "7 jours" : "Réduire";
  });
  const inputs = [...document.querySelectorAll("[data-trip]")];
  let day;
  function loadTrip() {
    const today = zonedParts(new Date(), CONFIG.timezone).day;
    if (today === day) return;
    day = today;
    let saved = {};
    try {
      const value = JSON.parse(localStorage.getItem("maison-panel:trip-checklist"));
      if (value?.day === day) saved = value.items || {};
    } catch { /* usable without storage */ }
    for (const input of inputs) input.checked = saved[input.dataset.trip] === true;
  }
  loadTrip(); setInterval(loadTrip, 60000);
  for (const input of inputs) input.addEventListener("change", () => {
    try {
      localStorage.setItem("maison-panel:trip-checklist", JSON.stringify({day,items:Object.fromEntries(inputs.map(i=>[i.dataset.trip,i.checked]))}));
      document.getElementById("trip-status").textContent = "Liste enregistrée pour aujourd’hui.";
    } catch { document.getElementById("trip-status").textContent = "Stockage indisponible · liste conservée seulement sur cette page."; }
  });
}
