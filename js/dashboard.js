export function initDashboard(config, root) {
  const opener = document.getElementById("explorer-open");
  if (!opener) return;
  const explorer = document.getElementById("tile-side");
  const closer = document.getElementById("explorer-close");
  const theme = document.getElementById("theme-toggle");
  function applyTheme(value) {
    document.documentElement.dataset.theme = value;
    theme.textContent = value === "paper" ? "Thème sombre" : "Thème clair";
  }
  try {
    const saved = localStorage.getItem("maison-panel:theme");
    applyTheme(
      ["night", "paper"].includes(saved)
        ? saved
        : config.ui?.defaultTheme || "night",
    );
  } catch {
    applyTheme(config.ui?.defaultTheme || "night");
  }
  theme.addEventListener("click", () => {
    const value =
      document.documentElement.dataset.theme === "paper" ? "night" : "paper";
    applyTheme(value);
    try {
      localStorage.setItem("maison-panel:theme", value);
    } catch {
      /* session-only theme */
    }
  });
  function toggle(open) {
    explorer.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    // Inert when supported; keyboard loop below also supports older WebViews.
    for (const selector of [".home-nav", "#tile-main", "#tile-spotify"]) {
      const sibling = root.querySelector(selector);
      if (sibling) sibling.inert = open;
    }
    (open ? closer : opener).focus();
  }
  opener.addEventListener("click", () => toggle(true));
  closer.addEventListener("click", () => toggle(false));
  explorer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      toggle(false);
    }
    if (event.key === "Tab") {
      const controls = [
        ...explorer.querySelectorAll("button,a[href],input"),
      ].filter((el) => !el.disabled && el.getClientRects().length);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  const forecast = document.getElementById("forecast-toggle");
  const days = document.getElementById("forecast-days");
  forecast.addEventListener("click", () => {
    days.hidden = !days.hidden;
    forecast.setAttribute("aria-expanded", String(!days.hidden));
    forecast.textContent = days.hidden ? "7 jours" : "Réduire";
  });
}
