const COMMAND_PREFIX = "Hey Google, broadcast ";

export function initBroadcast(root) {
  const toggle = root.querySelector(".broadcast-toggle");
  const menu = root.querySelector(".broadcast-menu");
  const status = root.querySelector(".broadcast-status");

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "Masquer" : "Afficher";
    menu.hidden = !expanded;
  });

  for (const button of menu.querySelectorAll("[data-message]")) {
    button.addEventListener("click", async () => {
      const phrase = `${COMMAND_PREFIX}${button.dataset.message}`;
      try {
        await navigator.clipboard.writeText(phrase);
        status.textContent = `Copié: « ${phrase} » — dites-le à Google Assistant`;
      } catch (err) {
        status.textContent = `Dites: « ${phrase} »`;
        console.warn("[broadcast] clipboard unavailable", err);
      }
    });
  }
}
