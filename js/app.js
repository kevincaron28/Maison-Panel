import { CONFIG } from "../config.js";
import { initClock } from "./clock.js";
import { initWeather } from "./weather.js";
import { initSolunar } from "./solunar.js";
import { initMarkets } from "./markets.js";
import { initCalendar } from "./calendar.js";
import { initSpotify } from "./spotify.js";
import { initCamera } from "./camera.js";
import { initBroadcast } from "./broadcast.js";

function safeInit(name, fn) {
  try {
    fn();
  } catch (err) {
    console.warn(`[app] ${name} failed to init`, err);
  }
}

function setupOfflineIndicator() {
  const el = document.getElementById("offline-indicator");
  const update = () => el.classList.toggle("is-visible", !navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

function setupNightMode(config) {
  function apply() {
    const hour = new Date().getHours();
    const { start, end, dimTo } = config.night;
    const isNight = start > end ? hour >= start || hour < end : hour >= start && hour < end;
    document.body.style.setProperty("--night-opacity", dimTo);
    document.body.classList.toggle("is-night", isNight);
  }
  apply();
  setInterval(apply, 5 * 60 * 1000);
}

// Shift the whole panel a few px on a slow cycle so a static clock/labels don't ghost into an
// always-on display (brief §8, burn-in).
function setupBurnInShift() {
  const panel = document.getElementById("panel");
  const offsets = [
    [0, 0],
    [4, 0],
    [0, 4],
    [-4, 0],
    [0, -4],
  ];
  let i = 0;
  setInterval(() => {
    i = (i + 1) % offsets.length;
    const [x, y] = offsets[i];
    panel.style.transform = `translate(${x}px, ${y}px)`;
  }, 60 * 60 * 1000);
}

function setupDailyReload(config) {
  setInterval(() => {
    if (new Date().getHours() === config.dailyReloadHour) location.reload();
  }, 60 * 1000);
}

function main() {
  safeInit("clock", () => initClock(CONFIG, document.getElementById("tile-header")));
  safeInit("weather", () => initWeather(CONFIG, document.getElementById("tile-weather")));
  safeInit("solunar", () => initSolunar(CONFIG, document.getElementById("tile-solunar")));
  safeInit("markets", () => initMarkets(CONFIG, document.getElementById("tile-markets")));
  safeInit("calendar", () => initCalendar(CONFIG, document.getElementById("tile-calendar")));
  safeInit("spotify", () => initSpotify(CONFIG, document.getElementById("tile-spotify")));
  safeInit("camera", () => initCamera(CONFIG, document.getElementById("tile-cameras")));
  safeInit("broadcast", () => initBroadcast(document.getElementById("tile-broadcast")));
  safeInit("offline indicator", setupOfflineIndicator);
  safeInit("night mode", () => setupNightMode(CONFIG));
  safeInit("burn-in shift", setupBurnInShift);
  safeInit("daily reload", () => setupDailyReload(CONFIG));

  // Camera footer stays hidden until it's actually configured.
  document.getElementById("tile-cameras").hidden = !(CONFIG.camera?.feeds || []).some((f) => f.enabled);
}

main();
