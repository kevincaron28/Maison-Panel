export function initForecastDialog() {
  const opener = document.getElementById("forecast-toggle"),
    days = document.getElementById("forecast-days");
  if (!opener || !days) return;
  const dialog = document.createElement("dialog");
  dialog.className = "forecast-dialog";
  dialog.setAttribute("aria-labelledby", "forecast-title");
  const header = document.createElement("div");
  header.className = "section-heading";
  const title = document.createElement("h2");
  title.id = "forecast-title";
  title.textContent = "Les 7 prochains jours";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Fermer";
  header.append(title, close);
  dialog.append(header, days);
  document.body.append(dialog);
  opener.addEventListener("click", () => {
    days.hidden = false;
    dialog.showModal();
    opener.setAttribute("aria-expanded", "true");
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    days.hidden = true;
    opener.setAttribute("aria-expanded", "false");
    opener.focus();
  });
}
