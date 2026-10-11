// Calendar tile — Phase 3 (docs/project-brief.md §5.3), built as Path B: a Google Calendar iframe
// embed. Chosen over Path A (public-calendar REST API) to keep the calendar private — this only
// shows events as long as the tablet's browser itself stays signed into the Google account that
// owns config.calendar.calendarId. No key, no network code of ours, no polling: the iframe is
// Google's own widget and refreshes itself.
export function initCalendar(config, root) {
  const { mode, calendarId } = config.calendar;

  if (mode !== "embed") {
    // Path A (public calendar + REST API) isn't built — see docs/project-brief.md §5.3 for the
    // endpoint shape if you switch config.calendar.mode to "api" later.
    root.querySelector(".calendar-embed-container").textContent = "Mode de calendrier non pris en charge. Utilisez le mode embed.";
    return;
  }
  if (!calendarId) {
    root.querySelector(".calendar-embed-container").textContent = "Ajoutez un calendrier dans la configuration.";
    return;
  }

  const params = new URLSearchParams({
    src: calendarId,
    ctz: config.timezone,
    mode: "AGENDA",
    showTitle: "0",
    showNav: "0",
    showTabs: "0",
    showCalendars: "0",
    showPrint: "0",
    showTz: "0",
    // undocumented but long-standing Google Calendar embed param — best-effort dark background;
    // Google's own text/UI chrome inside the iframe stays light regardless (brief §5.3 Path B
    // trade-off: no real styling control over what's inside the frame).
    bgcolor: "#141E22",
  });

  const iframe = document.createElement("iframe");
  iframe.src = `https://calendar.google.com/calendar/embed?${params}`;
  iframe.title = "Calendrier de la maison";
  iframe.setAttribute("frameborder", "0");
  iframe.setAttribute("scrolling", "no");
  root.querySelector(".calendar-embed-container").appendChild(iframe);
}
