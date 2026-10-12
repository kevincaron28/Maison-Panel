export function initDashboard(config, root) {
  const opener = document.getElementById("explorer-open");
  if (!opener) return;
  const explorer = document.getElementById("tile-side");
  const closer = document.getElementById("explorer-close");
  let returnFocus = opener;
  const panels = [...explorer.querySelectorAll(".explorer-grid > section")];
  const menu = document.getElementById("explorer-menu");
  const titles = { "tile-solunar": "Pêche & lune", "tile-markets": "Marchés", "tile-cameras": "Caméras" };
  if (config.camera?.feeds?.some(feed => feed.enabled !== false && feed.snapshotUrl)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.panel = "tile-cameras";
    button.textContent = "Caméras";
    explorer.querySelector(".explorer-tabs")?.appendChild(button);
  }
  function selectPanel(id = "") {
    for (const panel of panels) panel.hidden = panel.id !== id;
    if (menu) menu.hidden = Boolean(id);
    explorer.classList.toggle("is-detail", Boolean(id));
    document.getElementById("explorer-title").textContent = titles[id] || "Explorer la maison";
    for (const button of explorer.querySelectorAll("[data-panel]"))
      button.setAttribute("aria-pressed", String(button.dataset.panel === id));
    explorer.scrollTop = 0;
  }
  function toggle(open, trigger = opener) {
    if (open) returnFocus = trigger;
    explorer.hidden = !open;
    if (open) explorer.scrollTop = 0;
    opener.setAttribute("aria-expanded", String(open));
    // Inert when supported; keyboard loop below also supports older WebViews.
    for (const selector of [".home-nav", "#tile-main", "#tile-spotify"]) {
      const sibling = root.querySelector(selector);
      if (sibling) sibling.inert = open;
    }
    (open ? closer : returnFocus).focus();
  }
  opener.addEventListener("click", () => { selectPanel(); toggle(true); });
  document.getElementById("explorer-menu-back")?.addEventListener("click", () => {
    selectPanel();
    closer.focus();
  });
  for (const button of root.querySelectorAll("[data-panel]")) {
    button.addEventListener("click", () => {
      selectPanel(button.dataset.panel);
      if (explorer.hidden) toggle(true, button);
      const target = document.getElementById(button.dataset.panel);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      if (window.innerWidth <= 850) target.scrollIntoView?.({ block: "start" });
    });
  }
  closer.addEventListener("click", () => toggle(false));
  explorer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      toggle(false);
    }
    if (event.key === "Tab") {
      const controls = [
        ...explorer.querySelectorAll("button,a[href],input,select,iframe,[tabindex='0']"),
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
