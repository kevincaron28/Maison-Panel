import { getTimes } from "../vendor/suncalc.js";
import { zonedParts } from "./runtime.js";

const MODE_KEY = "maison-panel:home-mode";
const THEME_KEY = "maison-panel:theme-preference-v2";

export function solarState(config, now = new Date()) {
  const day = zonedParts(now, config.timezone).day;
  const noon = new Date(`${day}T12:00:00Z`);
  const { sunrise, sunset } = getTimes(noon, config.location.lat, config.location.lon);
  const tomorrow = new Date(+noon + 86400000);
  const nextRise = now < sunrise ? sunrise : getTimes(tomorrow, config.location.lat, config.location.lon).sunrise;
  return { daylight: now >= sunrise && now < sunset, sunrise, sunset, nextRise };
}

export function weatherMood(current, units, stale = false) {
  if (!current || stale) return "neutral";
  const code = current.weather_code;
  if (code >= 95) return "storm";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if (current.wind_speed_10m >= (units.wind === "mph" ? 18.64 : 30)) return "wind";
  if ([45, 48].includes(code)) return "fog";
  if ([0, 1].includes(code)) return "clear";
  return "cloudy";
}

export function initAppearance(config, doc = document, { pauseMusic, now = () => new Date() } = {}) {
  const theme = doc.getElementById("theme-toggle");
  const feedback = doc.getElementById("home-mode-status");
  const buttons = [...doc.querySelectorAll("button[data-home-mode]")];
  let preference = "auto", mode = { name: "home" }, busy = false;
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (["auto", "paper", "night"].includes(savedTheme)) preference = savedTheme;
    const savedMode = JSON.parse(localStorage.getItem(MODE_KEY));
    if (savedMode?.name === "away" || (savedMode?.name === "sleep" && Number.isFinite(savedMode.until))) mode = savedMode;
  } catch { /* automatic appearance also works without storage */ }
  if (mode.name !== "home") feedback.textContent = mode.name === "away"
    ? "Mode Absent conservé · Bonjour pour rétablir la luminosité."
    : "Bonne nuit · luminosité normale au prochain lever du soleil.";
  function save() {
    try {
      localStorage.setItem(THEME_KEY, preference);
      localStorage.setItem(MODE_KEY, JSON.stringify(mode));
    } catch { /* session-only choices */ }
  }
  function refresh() {
    const date = now();
    const sun = solarState(config, date);
    if (mode.name === "sleep" && +date >= mode.until) {
      mode = { name: "home" };
      save();
      feedback.textContent = "Bonjour · luminosité normale rétablie au lever du soleil.";
    }
    const dark = preference === "auto" ? !sun.daylight : preference === "night";
    doc.documentElement.dataset.theme = dark ? "night" : "paper";
    doc.documentElement.dataset.homeMode = mode.name;
    doc.documentElement.dataset.daylight = String(sun.daylight);
    doc.body.classList.toggle("is-night", mode.name !== "home");
    doc.body.style.setProperty("--night-opacity", String(mode.name === "away" ? 0.55 : 0.35));
    theme.textContent = { auto: "Thème auto", paper: "Thème clair", night: "Thème sombre" }[preference];
    theme.setAttribute("aria-label", `Thème : ${{auto:"automatique selon le soleil",paper:"clair",night:"sombre"}[preference]}. Changer de thème.`);
    const time = d => new Intl.DateTimeFormat(config.locale, {timeZone:config.timezone,hour:"2-digit",minute:"2-digit"}).format(d);
    theme.title = `Sherrington · lever ${time(sun.sunrise)} · coucher ${time(sun.sunset)}. Auto → clair → sombre.`;
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.homeMode === mode.name));
      button.disabled = busy;
    }
  }
  async function choose(event) {
    if (busy) return;
    const name = event.currentTarget.dataset.homeMode;
    const sun = solarState(config, now());
    mode = { name, ...(name === "sleep" ? {until:+sun.nextRise} : {}) };
    // Presets return the display to the requested sun-based appearance.
    preference = "auto";
    save();
    const label = {home:"Bonjour · luminosité normale",away:"Absent · écran atténué",sleep:"Bonne nuit · écran atténué jusqu’au lever du soleil"}[name];
    feedback.textContent = label;
    if (name === "home") { refresh(); return; }
    busy = true;
    refresh();
    feedback.textContent = `${label} · vérification de Spotify…`;
    try {
      const result = pauseMusic ? await pauseMusic() : "Spotify non configuré.";
      feedback.textContent = `${label} · ${result}`;
    } catch {
      feedback.textContent = `${label} · pause Spotify non confirmée, vérifiez la connexion.`;
    } finally {
      busy = false;
      refresh();
    }
  }
  function cycleTheme() {
    preference = {auto:"paper",paper:"night",night:"auto"}[preference];
    save(); refresh();
  }
  theme.addEventListener("click", cycleTheme);
  for (const button of buttons) button.addEventListener("click", choose);
  doc.addEventListener("visibilitychange", refresh);
  refresh();
  const timer = setInterval(refresh, 30000);
  return { refresh, stop() {
    clearInterval(timer);
    theme.removeEventListener("click", cycleTheme);
    for (const button of buttons) button.removeEventListener("click", choose);
    doc.removeEventListener("visibilitychange", refresh);
  } };
}
