import { fetchJson } from "./network.js";
export function eventLabel(event, config) {
  if (event.start.date)
    return (
      new Intl.DateTimeFormat(config.locale, {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(event.start.date + "T12:00Z")) + " · toute la journée"
    );
  return new Intl.DateTimeFormat(config.locale, {
    timeZone: config.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(event.start.dateTime));
}
export function initCalendar(config, root) {
  const container = root.querySelector(".calendar-embed-container");
  container.classList.add("native-agenda");
  const list = document.createElement("ol"),
    status = document.createElement("p"),
    actions = document.createElement("div");
  list.className = "agenda-events";
  status.className = "agenda-status";
  status.setAttribute("role", "status");
  actions.className = "agenda-actions";
  const connect = document.createElement("a");
  connect.href = "/api/auth/start";
  connect.textContent = "Connecter l’agenda";
  const full = document.createElement("a");
  full.href = "https://calendar.google.com/calendar/u/0/r/agenda";
  full.target = "_blank";
  full.rel = "noopener";
  full.textContent = "Calendrier complet ↗";
  const fallback = document.createElement("button");
  fallback.type = "button";
  fallback.textContent = "Vue Google";
  fallback.addEventListener("click", () => {
    let dialog = document.getElementById("calendar-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "calendar-dialog";
      dialog.className = "calendar-dialog";
      dialog.setAttribute("aria-label", "Calendrier Google");
      const close = document.createElement("button");
      close.textContent = "Fermer";
      close.type = "button";
      close.onclick = () => dialog.close();
      const frame = document.createElement("iframe");
      frame.title = "Calendrier privé de la maison";
      frame.src =
        "https://calendar.google.com/calendar/embed?" +
        new URLSearchParams({
          src: config.calendar.calendarId,
          ctz: config.timezone,
          mode: "AGENDA",
          hl: "fr",
          showTitle: "0",
          showNav: "1",
          showTabs: "0",
        });
      dialog.append(close, frame);
      document.body.append(dialog);
    }
    dialog.showModal();
  });
  actions.append(connect, full, fallback);
  container.replaceChildren(list, status, actions);
  let running = true,
    busy = false,
    timer,
    generation = 0;
  const clearPrivate = () => {
    generation++;
    list.replaceChildren();
    connect.hidden = false;
    status.textContent = "Connectez votre calendrier privé pour afficher les prochains événements.";
    const dialog = document.getElementById("calendar-dialog");
    if (dialog) dialog.remove();
  };
  async function refresh() {
    if (busy || !running) return;
    busy = true;
    const requestGeneration = generation;
    try {
      const data = await fetchJson("/api/calendar", { cache: "no-store" });
      if (requestGeneration !== generation || !running) return;
      if (!Array.isArray(data.events)) throw Error("Invalid agenda");
      list.replaceChildren();
      for (const event of data.events.slice(0, 5)) {
        const li = document.createElement("li"),
          time = document.createElement("span"),
          title = document.createElement("strong");
        time.textContent = eventLabel(event, config);
        title.textContent = event.summary || "Événement privé";
        li.append(time, title);
        list.append(li);
      }
      connect.hidden = true;
      status.textContent = data.events.length
        ? "Synchronisé avec Google Calendar"
        : "Rien de prévu dans les 31 prochains jours.";
      container.classList.remove("is-stale");
      try {
        sessionStorage.setItem(
          "maison-panel:calendar-health",
          JSON.stringify({ at: Date.now(), ok: true }),
        );
      } catch {}
    } catch (error) {
      connect.hidden = false;
      if (error.status === 401) {
        list.replaceChildren();
        status.textContent =
          "Connectez votre calendrier privé pour afficher les prochains événements.";
      } else
        status.textContent = list.children.length
          ? "Agenda non actualisé · dernières informations affichées."
          : "Agenda non connecté · la vue Google reste disponible.";
      container.classList.add("is-stale");
    } finally {
      busy = false;
      if (running) timer = setTimeout(refresh, config.refresh.calendar);
    }
  }
  const wake = () => {
    if (!document.hidden) {
      clearTimeout(timer);
      refresh();
    }
  };
  const logout = (event) => {
    if (event.key === "maison-panel:logout") clearPrivate();
  };
  const restore = (event) => {
    if (event.persisted) {
      clearPrivate();
      wake();
    }
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  window.addEventListener("storage", logout);
  window.addEventListener("pageshow", restore);
  refresh();
  return {
    stop() {
      running = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("storage", logout);
      window.removeEventListener("pageshow", restore);
    },
  };
}
