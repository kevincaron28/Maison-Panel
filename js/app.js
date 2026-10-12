import { initAppearance } from "./appearance.js";
import { initAlerts } from "./alerts.js";
import { CONFIG } from "../config.js";
import { createDailyReloadCheck } from "./runtime.js";

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
  setInterval(
    () => {
      i = (i + 1) % offsets.length;
      const [x, y] = offsets[i];
      panel.style.transform = `translate(${x}px, ${y}px)`;
    },
    60 * 60 * 1000,
  );
}

function setupDailyReload(config) {
  const check = createDailyReloadCheck(config, {
    storage: localStorage,
    reload: () => location.reload(),
    available: async () => {
      if (!navigator.onLine || new URLSearchParams(location.search).has("code"))
        return false;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(
          new URL("../index.html", import.meta.url),
          { cache: "no-store", signal: controller.signal },
        );
        return (
          response.ok &&
          (response.headers.get("content-type") || "").includes("text/html")
        );
      } finally {
        clearTimeout(timer);
      }
    },
  });
  setInterval(check, 60 * 1000);
}

async function loadTile(name, path, exportName, id) {
  const root = document.getElementById(id);
  try {
    const module = await import(path);
    const instance = await module[exportName](CONFIG, root);
    if (name === "clock") window.dispatchEvent(new Event("maison-ready"));
    return instance;
  } catch (err) {
    console.warn(`[app] ${name} failed to load`, err);
    const message = document.createElement("p");
    message.className = "tile-error";
    message.textContent =
      "Ce module est indisponible. Réessayez après avoir vérifié la connexion.";
    root.appendChild(message);
  }
}

function main() {
  safeInit("alerts", () => initAlerts(CONFIG, document.getElementById("daily-alerts")));
  loadTile("layout", "./dashboard.js", "initDashboard", "panel");
  loadTile("clock", "./clock.js", "initClock", "tile-header");
  loadTile("weather", "./weather.js", "initWeather", "tile-weather");
  loadTile("solunar", "./solunar.js", "initSolunar", "tile-solunar");
  loadTile("calendar", "./calendar.js", "initCalendar", "tile-calendar");
  const spotifyReady = loadTile("spotify", "./spotify.js", "initSpotify", "tile-spotify");
  if (
    CONFIG.camera.feeds.some(
      (feed) => feed.enabled !== false && feed.snapshotUrl,
    )
  ) {
    loadTile("camera", "./camera.js", "initCamera", "tile-cameras");
  }
  safeInit("offline indicator", setupOfflineIndicator);
  safeInit("appearance", () => initAppearance(CONFIG, document, {
    pauseMusic: async () => (await spotifyReady)?.pauseForMode() ?? "Spotify non configuré.",
  }));
  safeInit("burn-in shift", setupBurnInShift);
  safeInit("daily reload", () => setupDailyReload(CONFIG));
}

main();
