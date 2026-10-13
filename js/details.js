import { CONFIG } from "../config.js";
import { zonedParts } from "./runtime.js";
const page = document.body.dataset.page;
document.querySelector(`.home-nav a[href="${page}.html"]`)?.setAttribute("aria-current", "page");
import("./appearance.js").then(m=>m.initAppearance(CONFIG)).catch(console.warn);
import("./lifecycle.js").then(m=>m.initLifecycle(CONFIG)).catch(console.warn);
function network() {
  document.getElementById("detail-network").textContent = navigator.onLine ? "" : "Hors ligne · les cours nécessitent Internet; les données météo peuvent être anciennes.";
}
window.addEventListener("online", network);
window.addEventListener("offline", network);
network();
async function start(name, path, method, id) {
  try { const module = await import(path); module[method](CONFIG,document.getElementById(id)); }
  catch (error) { console.warn(`[${name}]`,error); const message=document.createElement("p");message.textContent=`${name} indisponible · rechargez pour réessayer.`;document.getElementById(id)?.append(message); }
}
if (page === "markets") {
  start("Publications", "./economic-calendar.js", "initEconomicCalendar", "economic-calendar");
  start("Marchés", "./markets.js", "initMarkets", "tile-markets");
  function clock() {
    document.getElementById("market-clock").textContent = new Intl.DateTimeFormat("fr-CA", {
      timeZone:"America/New_York", weekday:"long",hour:"2-digit",minute:"2-digit",
    }).format(new Date()) + " · New York";
  }
  clock(); setInterval(clock, 30000);
} else {
  start("Pêche", "./solunar.js", "initSolunar", "tile-solunar");
  start("Météo", "./weather.js", "initWeather", "tile-weather");
  import("./forecast-dialog.js").then(m=>m.initForecastDialog()).catch(console.warn);
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
