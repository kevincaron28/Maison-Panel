import { getTimes } from "../vendor/suncalc.js";
import { zonedParts } from "./runtime.js";

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

export function initAppearance(config, doc = document, { now = () => new Date() } = {}) {
  const theme = doc.getElementById("theme-toggle");
  let preference = config.ui?.defaultTheme || "auto";
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (["auto", "paper", "night"].includes(savedTheme)) preference = savedTheme;
    localStorage.removeItem("maison-panel:home-mode");
  } catch { /* automatic appearance also works without storage */ }
  function save() {
    try {
      localStorage.setItem(THEME_KEY, preference);
    } catch { /* session-only choices */ }
  }
  function refresh() {
    const date = now();
    const sun = solarState(config, date);
    const dark = preference === "auto" ? !sun.daylight : preference === "night";
    doc.documentElement.dataset.theme = dark ? "night" : "paper";
    doc.documentElement.dataset.daylight = String(sun.daylight);
    if (theme) theme.textContent = { auto: "Thème auto", paper: "Thème clair", night: "Thème sombre" }[preference];
    theme?.setAttribute("aria-label", `Thème : ${{auto:"automatique selon le soleil",paper:"clair",night:"sombre"}[preference]}. Changer de thème.`);
    const time = d => new Intl.DateTimeFormat(config.locale, {timeZone:config.timezone,hour:"2-digit",minute:"2-digit"}).format(d);
    if (theme) theme.title = `Sherrington · lever ${time(sun.sunrise)} · coucher ${time(sun.sunset)}. Auto → clair → sombre.`;
  }
  function cycleTheme() {
    preference = {auto:"paper",paper:"night",night:"auto"}[preference];
    save(); refresh();
  }
  theme?.addEventListener("click", cycleTheme);
  doc.addEventListener("visibilitychange", refresh);
  refresh();
  const timer = setInterval(refresh, 30000);
  return { refresh, stop() {
    clearInterval(timer);
    theme?.removeEventListener("click", cycleTheme);
    doc.removeEventListener("visibilitychange", refresh);
  } };
}
