// Weather tile — Open-Meteo (no key, CORS: *). Brief §5.1.
import { createPoller, formatUpdatedAt } from "./store.js";

// WMO weather_code → { fr, en, icon }. Icon keys map to buildIcon() below.
const WMO = {
  0: { fr: "ciel dégagé", en: "clear sky", icon: "clear" },
  1: { fr: "plutôt dégagé", en: "mainly clear", icon: "partly" },
  2: { fr: "partiellement nuageux", en: "partly cloudy", icon: "partly" },
  3: { fr: "couvert", en: "overcast", icon: "cloudy" },
  45: { fr: "brouillard", en: "fog", icon: "fog" },
  48: { fr: "brouillard givrant", en: "rime fog", icon: "fog" },
  51: { fr: "bruine légère", en: "light drizzle", icon: "drizzle" },
  53: { fr: "bruine", en: "drizzle", icon: "drizzle" },
  55: { fr: "bruine dense", en: "dense drizzle", icon: "drizzle" },
  56: { fr: "bruine verglaçante", en: "freezing drizzle", icon: "drizzle" },
  57: { fr: "bruine verglaçante dense", en: "dense freezing drizzle", icon: "drizzle" },
  61: { fr: "pluie légère", en: "light rain", icon: "rain" },
  63: { fr: "pluie", en: "rain", icon: "rain" },
  65: { fr: "forte pluie", en: "heavy rain", icon: "rain" },
  66: { fr: "pluie verglaçante", en: "freezing rain", icon: "rain" },
  67: { fr: "forte pluie verglaçante", en: "heavy freezing rain", icon: "rain" },
  71: { fr: "neige légère", en: "light snow", icon: "snow" },
  73: { fr: "neige", en: "snow", icon: "snow" },
  75: { fr: "forte neige", en: "heavy snow", icon: "snow" },
  77: { fr: "grains de neige", en: "snow grains", icon: "snow" },
  80: { fr: "averses légères", en: "light showers", icon: "rain" },
  81: { fr: "averses", en: "showers", icon: "rain" },
  82: { fr: "fortes averses", en: "violent showers", icon: "rain" },
  85: { fr: "averses de neige", en: "snow showers", icon: "snow" },
  86: { fr: "fortes averses de neige", en: "heavy snow showers", icon: "snow" },
  95: { fr: "orage", en: "thunderstorm", icon: "storm" },
  96: { fr: "orage avec grêle", en: "thunderstorm with hail", icon: "storm" },
  99: { fr: "orage avec forte grêle", en: "thunderstorm with heavy hail", icon: "storm" },
};

function weatherLabel(code, locale) {
  const entry = WMO[code];
  if (!entry) return "";
  return locale?.startsWith("fr") ? entry.fr : entry.en;
}

// Inline SVG icons only — no icon fonts (brief §5.1 / §8).
function buildIcon(code, isDay) {
  const entry = WMO[code];
  const kind = entry ? entry.icon : "cloudy";
  const sunOrMoon = isDay
    ? '<circle cx="12" cy="12" r="5" fill="currentColor"/>'
    : '<path d="M15 3a7 7 0 1 0 6 10.5A7 7 0 0 1 15 3z" fill="currentColor"/>';
  const cloud =
    '<path d="M7 18a4 4 0 0 1 .3-8 5 5 0 0 1 9.6-1.4A4.5 4.5 0 0 1 17 18H7z" fill="currentColor"/>';
  switch (kind) {
    case "clear":
      return `<svg viewBox="0 0 24 24" width="1em" height="1em">${sunOrMoon}</svg>`;
    case "partly":
      return `<svg viewBox="0 0 24 24" width="1em" height="1em">${sunOrMoon}${cloud}</svg>`;
    case "fog":
      return `<svg viewBox="0 0 24 24" width="1em" height="1em"><g stroke="currentColor" stroke-width="2" fill="none"><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="19" x2="21" y2="19"/></g></svg>`;
    case "drizzle":
    case "rain":
      return `<svg viewBox="0 0 24 24" width="1em" height="1em">${cloud}<g stroke="currentColor" stroke-width="2"><line x1="9" y1="19" x2="8" y2="22"/><line x1="14" y1="19" x2="13" y2="22"/></g></svg>`;
    case "snow":
      return `<svg viewBox="0 0 24 24" width="1em" height="1em">${cloud}<g stroke="currentColor" stroke-width="2"><line x1="9" y1="19" x2="9" y2="22"/><line x1="14" y1="19" x2="14" y2="22"/></g></svg>`;
    case "storm":
      return `<svg viewBox="0 0 24 24" width="1em" height="1em">${cloud}<path d="M11 18l-2 4h3l-1 3 4-5h-2l2-2h-4z" fill="currentColor"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" width="1em" height="1em">${cloud}</svg>`;
  }
}

async function fetchWeather(config) {
  const { lat, lon } = config.location;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day"
  );
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant"
  );
  url.searchParams.set("timezone", config.timezone);
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set(
    "temperature_unit",
    config.units.temp === "fahrenheit" ? "fahrenheit" : "celsius"
  );
  url.searchParams.set(
    "wind_speed_unit",
    config.units.wind === "mph" ? "mph" : "kmh"
  );

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

function localDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function windArrow(deg) {
  // meteorological convention: direction the wind blows FROM, arrow points where it's headed
  return `<span style="display:inline-block;transform:rotate(${deg}deg)">&#8593;</span>`;
}

function render(root, data, config, meta) {
  const c = data.current;
  const isFr = config.locale?.startsWith("fr");

  root.querySelector(".hero-temp").innerHTML =
    `${buildIcon(c.weather_code, c.is_day)} ${Math.round(c.temperature_2m)}°`;

  root.querySelector(".hero-sub").textContent =
    `${isFr ? "ressenti" : "feels"} ${Math.round(c.apparent_temperature)}° · ` +
    `${Math.round(c.wind_speed_10m)} ${config.units.wind} · ${c.relative_humidity_2m}%`;

  const hourly = root.querySelector(".hourly-strip");
  hourly.innerHTML = "";
  const nowIdx = data.hourly.time.findIndex((t) => new Date(t) >= new Date());
  for (let i = Math.max(nowIdx, 0); i < Math.max(nowIdx, 0) + 12 && i < data.hourly.time.length; i++) {
    const hour = new Date(data.hourly.time[i]).getHours();
    const el = document.createElement("div");
    el.className = "hour";
    el.innerHTML = `<div>${hour}h</div>${buildIcon(data.hourly.weather_code[i], 1)}<div>${Math.round(
      data.hourly.temperature_2m[i]
    )}°</div><div>${data.hourly.precipitation_probability[i]}%</div>`;
    hourly.appendChild(el);
  }

  const days = root.querySelector(".daily-rows");
  days.innerHTML = "";
  for (let i = 0; i < data.daily.time.length; i++) {
    const dayDate = localDate(data.daily.time[i]);
    const label = new Intl.DateTimeFormat(config.locale, { weekday: "short" }).format(dayDate);
    const dateLabel = new Intl.DateTimeFormat(config.locale, {
      day: "numeric",
      month: "short",
    }).format(dayDate);
    const row = document.createElement("div");
    row.className = "day-row";
    const summary = document.createElement("button");
    summary.className = "day-summary";
    summary.type = "button";
    summary.setAttribute("aria-expanded", "false");
    summary.innerHTML =
      `<span class="day-name"><strong>${label}</strong><small>${dateLabel}</small></span>` +
      `${buildIcon(data.daily.weather_code[i], 1)}<span class="day-temperatures">${Math.round(
        data.daily.temperature_2m_max[i]
      )}° / ${Math.round(data.daily.temperature_2m_min[i])}°</span>`;

    const details = document.createElement("div");
    details.className = "day-details";
    details.hidden = true;
    const rainChance = data.daily.precipitation_probability_max?.[i];
    const rainTotal = data.daily.precipitation_sum?.[i];
    const windMax = data.daily.wind_speed_10m_max?.[i];
    const windDirection = data.daily.wind_direction_10m_dominant?.[i];
    details.innerHTML =
      `<span>${isFr ? "Pluie" : "Rain"}: ${rainChance ?? "—"}%` +
      ` (${rainTotal == null ? "—" : Math.round(rainTotal)} mm)</span>` +
      `<span>${isFr ? "Vent" : "Wind"}: ${windMax == null ? "—" : Math.round(windMax)} ${config.units.wind}` +
      `${windDirection == null ? "" : ` ${windArrow(windDirection)}`}</span>` +
      `<span>${isFr ? "Soleil" : "Sun"}: ${new Intl.DateTimeFormat(config.locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(data.daily.sunrise[i]))}–${new Intl.DateTimeFormat(config.locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(data.daily.sunset[i]))}</span>`;

    summary.addEventListener("click", () => {
      const expanded = !summary.matches("[aria-expanded='true']");
      summary.setAttribute("aria-expanded", String(expanded));
      details.hidden = !expanded;
    });
    row.append(summary, details);
    days.appendChild(row);
  }

  root.classList.toggle("is-stale", meta.stale);
  const staleNote = root.querySelector(".stale-note");
  if (staleNote) staleNote.textContent = meta.stale ? formatUpdatedAt(meta.fetchedAt) : "";

  void weatherLabel; // label lookup available for a future text description line
  void windArrow;
}

export function initWeather(config, root) {
  const locationEl = root.querySelector(".weather-location");
  if (locationEl) locationEl.textContent = config.location.label ? `— ${config.location.label}` : "";

  const poller = createPoller({
    key: "weather",
    intervalMs: config.refresh.weather,
    fetcher: () => fetchWeather(config),
    onData: (data, meta) => render(root, data, config, meta),
    onError: (err) => console.warn("[weather]", err),
  });
  poller.start();
  return poller;
}
