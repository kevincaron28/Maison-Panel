import { syncReminders } from "./reminder-sync.js";
export function idleMinutes(storage = localStorage) {
  try {
    const value = Number(storage.getItem("maison-panel:idle-minutes") ?? 5);
    return [0, 2, 5, 10, 30].includes(value) ? value : 5;
  } catch {
    return 5;
  }
}
export function initLifecycle(config) {
  let last = Date.now();
  const reset = () => (last = Date.now());
  for (const event of ["pointerdown", "keydown", "input", "wheel"])
    document.addEventListener(event, reset, { passive: true });
  setInterval(() => {
    if (
      !document.body.dataset.page ||
      document.body.dataset.page === "settings" ||
      document.body.dataset.page === "deck" ||
      document.hidden
    )
      return;
    const minutes = idleMinutes();
    if (
      !minutes ||
      Date.now() - last < minutes * 60000 ||
      document.querySelector("dialog[open],.music-dialog:not([hidden])") ||
      document.activeElement?.matches("input,textarea,select")
    )
      return;
    location.assign("./");
  }, 15000);
  syncReminders().catch(() => {});
  setInterval(() => syncReminders().catch(() => {}), 60000);
  window.addEventListener("online", () => syncReminders().catch(() => {}));
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        const announce = () => {
          if (!reg.waiting) return;
          let button = document.getElementById("apply-update");
          if (!button) {
            button = document.createElement("button");
            button.id = "apply-update";
            button.className = "update-ready";
            button.textContent = "Mise à jour prête · appliquer";
            document.body.append(button);
          }
          button.onclick = () => {
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => location.reload(),
              { once: true },
            );
            reg.waiting?.postMessage({ type: "ACTIVATE" });
          };
        };
        announce();
        reg.addEventListener("updatefound", () =>
          reg.installing?.addEventListener("statechange", announce),
        );
        // A wall tablet has nobody to tap "appliquer": apply a ready update after a minute
        // without touches, never while a dialog is open or a field has focus.
        setInterval(() => {
          if (
            reg.waiting &&
            Date.now() - last > 60000 &&
            !document.querySelector("dialog[open],.music-dialog:not([hidden])") &&
            !document.activeElement?.matches("input,textarea,select")
          )
            document.getElementById("apply-update")?.click();
        }, 15000);
        setInterval(() => reg.update().catch(() => {}), 900000);
      })
      .catch(() => {});
}
