import { readReminders, reminderTime, REMINDERS_KEY } from "./alerts.js";
import { CONFIG } from "../config.js";
const reminderStatus = document.getElementById("reminder-status");
function renderReminders() {
  const list = document.getElementById("reminder-list");
  list.replaceChildren();
  for (const entry of readReminders().sort((a,b)=>a.at-b.at)) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${new Intl.DateTimeFormat(CONFIG.locale,{timeZone:CONFIG.timezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(entry.at))} · ${entry.title}`;
    const remove = document.createElement("button");
    remove.type = "button"; remove.textContent = "Supprimer";
    remove.setAttribute("aria-label",`Supprimer ${entry.title}`);
    remove.addEventListener("click",()=>{
      try {
        localStorage.setItem(REMINDERS_KEY,JSON.stringify(readReminders().filter(e=>e.id!==entry.id)));
        renderReminders();
      } catch { reminderStatus.textContent = "Stockage indisponible."; }
    });
    li.append(label,remove); list.append(li);
  }
}
document.getElementById("reminder-form").addEventListener("submit",event=>{
  event.preventDefault();
  const title = document.getElementById("reminder-title").value.trim();
  const at = reminderTime(document.getElementById("reminder-time").value,CONFIG.timezone);
  if (!title || !Number.isFinite(at) || at < Date.now()) { reminderStatus.textContent = "Choisissez un titre et une date future valide (heure de Toronto)."; return; }
  try {
    const entries = readReminders();
    if (entries.length>=100) { reminderStatus.textContent = "Supprimez les anciens rappels avant d’en ajouter (maximum 100)."; return; }
    localStorage.setItem(REMINDERS_KEY,JSON.stringify([...entries,{id:crypto.randomUUID(),title,at}]));
    event.target.reset(); renderReminders(); reminderStatus.textContent = "Rappel enregistré dans ce navigateur.";
  } catch { reminderStatus.textContent = "Stockage indisponible · rappel non enregistré."; }
});
renderReminders();
const status = document.getElementById("settings-status");
const input = document.getElementById("market-key");
document.getElementById("current-url").textContent = location.origin + "/";
document.getElementById("spotify-redirect").textContent = location.origin + "/";
try {
  const hasSession = Boolean(localStorage.getItem("maison-panel:spotify-tokens"));
  document.getElementById("spotify-storage-status").textContent = hasSession
    ? "Une session Spotify est enregistrée dans ce navigateur."
    : "Aucune session Spotify enregistrée dans ce navigateur.";
} catch {
  document.getElementById("spotify-storage-status").textContent = "Le stockage est bloqué : autorisez les données de site pour conserver la connexion.";
}
document.getElementById("device-status").textContent = navigator.onLine
  ? "Connexion réseau disponible"
  : "Hors ligne";
document
  .getElementById("market-settings")
  .addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      if (!input.value.trim()) {
        status.textContent = "Saisissez une clé, ou utilisez Déconnecter.";
        return;
      }
      localStorage.setItem("maison-panel:fmp-key", input.value.trim());
      input.value = "";
      status.textContent =
        "Enregistré. Revenez au panneau pour charger les marchés.";
    } catch {
      status.textContent = "Le stockage du navigateur est indisponible.";
    }
  });
document.getElementById("remove-key").addEventListener("click", () => {
  try {
    localStorage.removeItem("maison-panel:fmp-key");
    status.textContent = "Marchés déconnectés.";
  } catch {
    status.textContent = "Le stockage du navigateur est indisponible.";
  }
});
