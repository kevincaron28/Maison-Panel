// Fishing / solunar tile — Phase 2 (docs/project-brief.md §5.2). Zero network calls: everything
// here is astronomy math against the vendored SunCalc (vendor/suncalc.js).
import { getMoonIllumination, getMoonPosition, getMoonTimes, getTimes } from "../vendor/suncalc.js";

const MINUTE_MS = 60 * 1000;

export function fishingWindow(periods, stars, now = Date.now()) {
  const windows = periods.filter(p => Math.abs(now - +p.center) <= p.halfWidthMin * MINUTE_MS);
  const active = windows.find(p => p.kind === "major") || windows[0];
  return active ? (active.kind === "major" && stars >= 3 ? "optimal" : "active") : "inactive";
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Moon *position* (altitude) from SunCalc, sampled once a minute across the day, gives transit
// (highest altitude, moon overhead) and underfoot (lowest altitude, moon opposite the meridian) —
// brief §5.2. A day is cheap enough to sample in full on a device that's otherwise idle.
function findMoonExtrema(dayStart, lat, lon) {
  let maxTime = null, minTime = null;
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);
  const minutes = (nextDay - dayStart) / MINUTE_MS;
  // Detect an actual local extremum, not an arbitrary midnight boundary.
  for (let m = 0; m < minutes; m++) {
    const t = new Date(dayStart.getTime() + m * MINUTE_MS);
    const alt = getMoonPosition(t, lat, lon).altitude;
    const before = getMoonPosition(new Date(+t - MINUTE_MS), lat, lon).altitude;
    const after = getMoonPosition(new Date(+t + MINUTE_MS), lat, lon).altitude;
    if (alt > before && alt >= after) maxTime = t;
    if (alt < before && alt <= after) minTime = t;
  }
  return { transit: maxTime, underfoot: minTime };
}

// Major periods (moon transit/underfoot, ±1h) and minor periods (moonrise/moonset, ±30min) for the
// given calendar day, plus that day's sun times (used for the day-rating golden-hour bonus below).
export function computeDayPeriods(dayStart, lat, lon) {
  const { transit, underfoot } = findMoonExtrema(dayStart, lat, lon);
  const moonTimes = getMoonTimes(dayStart, lat, lon);
  const noon = new Date(dayStart);
  noon.setHours(12);
  const sunTimes = getTimes(noon, lat, lon);

  const periods = [];
  if (transit) periods.push({ kind: "major", label: "moon transit", center: transit, halfWidthMin: 60 });
  if (underfoot) periods.push({ kind: "major", label: "moon underfoot", center: underfoot, halfWidthMin: 60 });
  if (moonTimes.rise) periods.push({ kind: "minor", label: "moonrise", center: moonTimes.rise, halfWidthMin: 30 });
  if (moonTimes.set) periods.push({ kind: "minor", label: "moonset", center: moonTimes.set, halfWidthMin: 30 });
  periods.sort((a, b) => a.center - b.center);
  return { periods, sunTimes, moonTimes };
}

// Day rating, 0-4 stars. This is folk knowledge, not physics — tune freely:
//   - base score is proximity to new/full moon (illumination fraction near 0 or 1), since that's
//     when solunar theory says fish activity peaks; a quarter moon (fraction 0.5) scores lowest.
//   - +1 star, capped at 4, if a major period's window overlaps sunrise or sunset — the classic
//     "dawn/dusk feed" bonus anglers already watch for.
export function rateDay(fraction, periods, sunTimes) {
  const proximity = Math.abs(fraction - 0.5) * 2; // 0 at quarter, 1 at new/full
  let stars = Math.round(proximity * 4);

  const goldenMoments = [sunTimes.sunrise, sunTimes.sunset].filter(Boolean);
  const overlapsGolden = periods
    .filter((p) => p.kind === "major")
    .some((p) => goldenMoments.some((g) => Math.abs(g - p.center) <= p.halfWidthMin * MINUTE_MS));
  if (overlapsGolden) stars = Math.min(4, stars + 1);

  return stars;
}

function starString(stars) {
  return "★".repeat(stars) + "☆".repeat(4 - stars);
}

// Illuminated-fraction moon disc, drawn as two arcs (limb + terminator) rather than an emoji —
// brief §5.2/§8. Derivation: terminator half-width rx = |1 - 2*fraction| * r (0 at quarter, r at
// new/full, where limb and terminator arcs coincide — either cancelling to an empty sliver at new,
// or combining into a full circle at full). Which side is lit follows `waxing` (Northern-hemisphere
// convention: waxing lit on the right, waning on the left); the terminator bulges toward that same
// side while waxing/waning past new (crescent) and toward the opposite side past the midpoint
// (gibbous), matching how a crescent narrows to nothing while a gibbous fills past the half line.
function moonDiscSvg(fraction, waxing, size = 96) {
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const rightLit = waxing;
  const bulgeRight = fraction < 0.5 ? rightLit : !rightLit;
  const rx = Math.abs(1 - 2 * fraction) * r;
  const limbSweep = rightLit ? 1 : 0;
  const terminatorSweep = bulgeRight ? 0 : 1;

  const path =
    `M ${cx},${cy - r} ` +
    `A ${r},${r} 0 0 ${limbSweep} ${cx},${cy + r} ` +
    `A ${rx},${r} 0 0 ${terminatorSweep} ${cx},${cy - r} Z`;

  return (
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ink-mid)" stroke-width="1.5"/>` +
    `<path d="${path}" fill="var(--ink-high)"/>` +
    `</svg>`
  );
}

const PERIOD_LABELS = {
  "moon transit": { fr: "lune au zénith", en: "moon at zenith" },
  "moon underfoot": { fr: "lune au nadir", en: "moon at nadir" },
  moonrise: { fr: "lever de lune", en: "moonrise" },
  moonset: { fr: "coucher de lune", en: "moonset" },
};

function periodKindLabel(label, isFr) {
  const entry = PERIOD_LABELS[label];
  if (!entry) return label;
  return isFr ? entry.fr : entry.en;
}

function formatCountdown(ms) {
  const totalMin = Math.round(ms / MINUTE_MS);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function render(root, config, model) {
  const isFr = config.locale?.startsWith("fr");
  const { fraction, waxing, periods, stars, sunTimes } = model;
  const time = (date) => date && Number.isFinite(+date)
    ? new Intl.DateTimeFormat(config.locale, { timeZone: config.timezone, hour: "2-digit", minute: "2-digit" }).format(date)
    : "—";

  root.querySelector(".moon-disc").innerHTML = moonDiscSvg(fraction, waxing, 96);
  root.querySelector(".moon-phase-label").textContent =
    `${waxing ? (isFr ? "croissante" : "waxing") : isFr ? "décroissante" : "waning"} ${Math.round(fraction * 100)}%`;
  root.querySelector(".day-rating").textContent = starString(stars);
  root.querySelector(".day-rating").setAttribute("aria-label", `${stars} sur 4 · indice solunaire`);
  root.querySelector(".fishing-sun").textContent = `Soleil · lever ${time(sunTimes.sunrise)} · coucher ${time(sunTimes.sunset)}`;
  root.querySelector(".solunar-periods").innerHTML = periods
    .map((period) => {
      const label = periodKindLabel(period.label, isFr);
      const start = new Date(+period.center - period.halfWidthMin * MINUTE_MS);
      const end = new Date(+period.center + period.halfWidthMin * MINUTE_MS);
      return `<div class="fishing-period"><div><strong>${period.kind === "major" ? "Majeure" : "Mineure"}</strong><span>${label} · pic ${time(period.center)}</span></div><time>${time(start)} – ${time(end)}</time></div>`;
    })
    .join("");

}

// Cheap per-tick update: find the active or next period and render its label/countdown, without
// re-running the astronomy sampling. Called far more often than the full refresh.
function updateCountdown(root, config, periods) {
  const isFr = config.locale?.startsWith("fr");
  const now = Date.now();
  const countdownEl = root.querySelector(".next-period");

  const withWindow = periods.map((p) => ({
    ...p,
    start: p.center.getTime() - p.halfWidthMin * MINUTE_MS,
    end: p.center.getTime() + p.halfWidthMin * MINUTE_MS,
  }));

  const active = withWindow.find((p) => now >= p.start && now <= p.end);
  countdownEl.classList.toggle("solunar-active", Boolean(active));

  if (active) {
    const kind = periodKindLabel(active.label, isFr);
    const line = isFr
      ? `période active — ${formatCountdown(active.end - now)} restant`
      : `active period — ${formatCountdown(active.end - now)} left`;
    countdownEl.innerHTML = `<span class="period-kind">${kind}</span>${line}`;
    return;
  }

  const upcoming = withWindow.filter((p) => p.start > now).sort((a, b) => a.start - b.start)[0];
  if (upcoming) {
    const kind = periodKindLabel(upcoming.label, isFr);
    const line = isFr
      ? `dans ${formatCountdown(upcoming.start - now)}`
      : `in ${formatCountdown(upcoming.start - now)}`;
    countdownEl.innerHTML = `<span class="period-kind">${kind}</span>${line}`;
  } else {
    countdownEl.textContent = "";
  }
}

export function initSolunar(config, root) {
  const { lat, lon } = config.location;
  let periods = [];
  let selectedDay = 0;
  let models = [];
  const buttons = root.querySelectorAll("[data-fishing-day]");
  function showDay() {
    render(root, config, models[selectedDay]);
    for (const button of buttons) button.setAttribute("aria-pressed", String(Number(button.dataset.fishingDay) === selectedDay));
    updateCountdown(root, config, periods);
    updateHomeFishing();
  }
  function updateHomeFishing() {
    const state = fishingWindow(periods, models[0]?.stars || 0);
    document.documentElement.dataset.fishing = state;
    const banner = document.getElementById("fishing-now");
    if (banner) {
      banner.hidden = state === "inactive";
      banner.textContent = state === "optimal" ? "Pêche · créneau solunaire favorable" : "Pêche · période solunaire active";
      banner.title = "Indication solunaire, sans garantie de prises. Vérifiez les conditions météo avant de partir.";
    }
  }
  for (const button of buttons) button.addEventListener("click", () => {
    selectedDay = Number(button.dataset.fishingDay);
    showDay();
  });

  function recompute() {
    const today = startOfLocalDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayResult = computeDayPeriods(today, lat, lon);
    const tomorrowResult = computeDayPeriods(tomorrow, lat, lon);
    periods = [...todayResult.periods, ...tomorrowResult.periods];

    models = [todayResult, tomorrowResult].map((result, index) => {
      const noon = new Date(index ? tomorrow : today);
      noon.setHours(12);
      const illum = getMoonIllumination(noon);
      return { ...result, fraction: illum.fraction, waxing: illum.waxing,
        stars: rateDay(illum.fraction, result.periods, result.sunTimes) };
    });
    showDay();
  }

  recompute();
  setInterval(recompute, config.refresh.solunar);
  setInterval(() => { updateCountdown(root, config, periods); updateHomeFishing(); }, 15 * 1000);
}
