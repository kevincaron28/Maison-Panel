import { ECONOMIC_EVENTS, ECONOMIC_VALID_UNTIL } from "./economic-events.js";
import { reminderTime } from "./time.js";
import { zonedParts } from "./runtime.js";
export function upcomingEconomic(events, now, timezone) {
  const day = zonedParts(now, timezone).day;
  return events
    .filter((e) =>
      e.time
        ? reminderTime(`${e.date}T${e.time}`, timezone) > +now
        : e.date >= day,
    )
    .sort((a, b) =>
      (a.date + (a.time || "23:59")).localeCompare(
        b.date + (b.time || "23:59"),
      ),
    );
}
export function initEconomicCalendar(config, root) {
  const upcoming = root.querySelector("#economic-upcoming"),
    all = document.getElementById("economic-all");
  function render() {
    upcoming.replaceChildren();
    all.replaceChildren();
    const now = new Date(),
      today = zonedParts(now, config.timezone).day;
    const events = upcomingEconomic(ECONOMIC_EVENTS, now, config.timezone);
    const row = (e) => {
      const li = document.createElement("li"),
        a = document.createElement("a");
      a.href = e.source;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = `${e.date} · ${e.time || "heure à confirmer"} · ${e.title}`;
      li.append(a);
      return li;
    };
    for (const event of events.slice(0, 3)) upcoming.append(row(event));
    for (const event of ECONOMIC_EVENTS.filter((e) => e.date >= today)) {
      const li = row(event);
      if (!events.includes(event)) li.append(" · publié aujourd’hui");
      all.append(li);
    }
    if (!events.length)
      upcoming.textContent =
        today > ECONOMIC_VALID_UNTIL
          ? "Sélection à actualiser · consultez le calendrier complet."
          : "Aucune autre publication dans la sélection.";
    let status = document.getElementById("economic-validity");
    if (!status) {
      status = document.createElement("p");
      status.id = "economic-validity";
      all.after(status);
    }
    status.textContent = `Sélection valable jusqu’au ${ECONOMIC_VALID_UNTIL}. ${today > ECONOMIC_VALID_UNTIL ? "Mise à jour nécessaire." : "Les heures et sources restent à confirmer avant publication."}`;
  }
  render();
  const timer = setInterval(render, 60000);
  document.addEventListener("visibilitychange", render);
  return {
    stop() {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", render);
    },
  };
}
