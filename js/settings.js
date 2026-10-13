import {
  readReminders,
  reminderTime,
  nextOccurrence,
  REMINDERS_KEY,
} from "./alerts.js";
import { CONFIG } from "../config.js";
import { syncReminders } from "./reminder-sync.js";
import { loadCache } from "./store.js";
import { RELEASE } from "./release.js";
import("./appearance.js")
  .then((m) => m.initAppearance(CONFIG))
  .catch(console.warn);
import("./lifecycle.js")
  .then((m) => m.initLifecycle(CONFIG))
  .catch(console.warn);
const q = (id) => document.getElementById(id),
  reminderStatus = q("reminder-status");
function save(items) {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(items));
  renderReminders();
  syncReminders().catch(() => {
    reminderStatus.textContent = "Enregistré ici · synchronisation en attente.";
  });
  document.dispatchEvent(new Event("maison-reminders"));
}
function localInput(at) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CONFIG.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function cancelEdit() {
  q("reminder-form").reset();
  q("reminder-id").value = "";
  q("reminder-save").textContent = "Ajouter";
  q("reminder-cancel").hidden = true;
}
function renderReminders() {
  q("reminder-list").replaceChildren();
  q("reminder-archive").replaceChildren();
  for (const entry of readReminders().sort((a, b) => a.at - b.at)) {
    const li = document.createElement("li"),
      label = document.createElement("span");
    const occurrence = nextOccurrence(entry) || entry;
    label.textContent = `${new Intl.DateTimeFormat(CONFIG.locale, { timeZone: CONFIG.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(occurrence.at))} · ${entry.title}${entry.repeat && entry.repeat !== "none" ? " · " + { daily: "chaque jour", weekly: "chaque semaine", monthly: "chaque mois" }[entry.repeat] : ""}`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Modifier";
    edit.onclick = () => {
      q("reminder-id").value = entry.id;
      q("reminder-title").value = entry.title;
      q("reminder-time").value = localInput(occurrence.at);
      q("reminder-repeat").value = entry.repeat || "none";
      q("reminder-save").textContent = "Enregistrer";
      q("reminder-cancel").hidden = false;
      q("reminder-title").focus();
    };
    const archive = document.createElement("button");
    archive.type = "button";
    archive.textContent = entry.archived ? "Restaurer" : "Archiver";
    archive.onclick = () => {
      try {
        if (
          entry.archived &&
          readReminders().filter((e) => !e.archived).length >= 100
        ) {
          reminderStatus.textContent =
            "Archivez un autre rappel avant de restaurer celui-ci (maximum 100 actifs).";
          return;
        }
        save(
          readReminders().map((e) =>
            e.id === entry.id
              ? { ...e, archived: !entry.archived, updatedAt: Date.now() }
              : e,
          ),
        );
      } catch {
        reminderStatus.textContent = "Stockage indisponible.";
      }
    };
    li.append(label);
    if (!entry.archived) li.append(edit);
    li.append(archive);
    q(entry.archived ? "reminder-archive" : "reminder-list").append(li);
  }
  try {
    const at = Number(localStorage.getItem("maison-panel:last-sync"));
    if (at)
      q("reminder-sync-status").textContent =
        `Dernière synchronisation : ${new Intl.DateTimeFormat(CONFIG.locale, { timeZone: CONFIG.timezone, timeStyle: "short" }).format(at)}. Modifications hors ligne conservées ici jusqu’à la reconnexion.`;
  } catch {}
}
q("reminder-cancel").onclick = cancelEdit;
q("reminder-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = q("reminder-title").value.trim(),
    at = reminderTime(q("reminder-time").value, CONFIG.timezone),
    id = q("reminder-id").value;
  if (!title || !Number.isFinite(at) || at < Date.now()) {
    reminderStatus.textContent =
      "Choisissez une date future valide (heure de Toronto).";
    return;
  }
  try {
    const items = readReminders();
    if (!id && items.length >= 1000) {
      reminderStatus.textContent =
        "Archive complète (1 000 rappels). Contactez le propriétaire pour exporter et nettoyer les archives.";
      return;
    }
    if (!id && items.filter((e) => !e.archived).length >= 100) {
      reminderStatus.textContent =
        "Archivez les rappels terminés (maximum 100 actifs).";
      return;
    }
    const entry = {
      id: id || crypto.randomUUID(),
      title,
      at,
      repeat: q("reminder-repeat").value,
      archived: false,
      updatedAt: Date.now(),
    };
    save([...items.filter((e) => e.id !== id), entry]);
    cancelEdit();
    reminderStatus.textContent = "Rappel enregistré.";
  } catch {
    reminderStatus.textContent =
      "Stockage indisponible · rappel non enregistré.";
  }
});
q("archive-expired").onclick = () => {
  try {
    save(
      readReminders().map((e) =>
        !e.archived && !nextOccurrence(e, Date.now() - 3600000)
          ? { ...e, archived: true, updatedAt: Date.now() }
          : e,
      ),
    );
    reminderStatus.textContent = "Rappels terminés archivés.";
  } catch {
    reminderStatus.textContent = "Stockage indisponible.";
  }
};
document.addEventListener("maison-reminders", renderReminders);
renderReminders();
try {
  q("idle-minutes").value =
    localStorage.getItem("maison-panel:idle-minutes") || "5";
} catch {}
q("idle-minutes").onchange = () => {
  try {
    localStorage.setItem("maison-panel:idle-minutes", q("idle-minutes").value);
  } catch {
    reminderStatus.textContent =
      "Préférence non enregistrée : stockage indisponible.";
  }
};
async function diagnostics() {
  const list = q("diagnostics");
  list.replaceChildren();
  let storage = "Disponible";
  try {
    localStorage.setItem("maison-panel:storage-test", "1");
    localStorage.removeItem("maison-panel:storage-test");
  } catch {
    storage = "Indisponible";
  }
  const cached = loadCache(
    `weather-v3:${CONFIG.location.lat}:${CONFIG.location.lon}:${CONFIG.timezone}:${CONFIG.units.temp}:${CONFIG.units.wind}`,
  );
  for (const [name, value] of [
    ["Version", RELEASE],
    [
      "Réseau",
      navigator.onLine ? "Accessible depuis le navigateur" : "Hors ligne",
    ],
    ["Stockage", storage],
    [
      "Météo",
      cached
        ? `Dernière récupération il y a ${Math.floor((Date.now() - cached.fetchedAt) / 60000)} min`
        : "Aucune donnée en cache",
    ],
    [
      "Mode hors ligne",
      navigator.serviceWorker?.controller
        ? "Cache du panneau actif"
        : "En attente de l’installation / du prochain chargement",
    ],
  ]) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = name;
    dd.textContent = value;
    list.append(dt, dd);
  }
  try {
    const response = await fetch("/api/calendar", {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    const ok = response.ok && Array.isArray(data.events);
    q("calendar-connection").textContent = ok
      ? "Agenda connecté · lecture vérifiée."
      : response.status === 401
        ? "Connectez votre compte Google pour activer l’agenda et la synchronisation."
        : "Connexion Google indisponible ou configuration à terminer.";
    q("calendar-disconnect").hidden = !ok;
  } catch {
    q("calendar-connection").textContent =
      "Connexion Google non vérifiée · réessayez lorsque le réseau est disponible.";
  }
}
q("check-connections").onclick = diagnostics;
q("calendar-disconnect").onclick = async () => {
  const response = await fetch("/api/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (response.ok) {
    localStorage.setItem("maison-panel:logout", String(Date.now()));
    localStorage.removeItem("maison-panel:last-sync");
    sessionStorage.removeItem("maison-panel:calendar-health");
    q("reminder-sync-status").textContent =
      "Déconnecté · les rappels de ce navigateur sont conservés localement.";
    await diagnostics();
  }
};
diagnostics();
const status = document.getElementById("settings-status");
const input = document.getElementById("market-key");
document.getElementById("current-url").textContent = location.origin + "/";
document.getElementById("spotify-redirect").textContent = location.origin + "/";
try {
  const hasSession = Boolean(
    localStorage.getItem("maison-panel:spotify-tokens"),
  );
  document.getElementById("spotify-storage-status").textContent = hasSession
    ? "Session Spotify enregistrée · disponibilité à vérifier depuis l’accueil."
    : "Aucune session Spotify enregistrée dans ce navigateur.";
} catch {
  document.getElementById("spotify-storage-status").textContent =
    "Le stockage est bloqué : autorisez les données de site pour conserver la connexion.";
}
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
    status.textContent = "Clé FMP retirée.";
  } catch {
    status.textContent = "Le stockage du navigateur est indisponible.";
  }
});
