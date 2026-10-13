import { readReminders, REMINDERS_KEY } from "./alerts.js";
let busy = false;
export function mergeLocal(remote, local) {
  const merged = new Map();
  for (const item of [...remote, ...local])
    if (
      !merged.has(item.id) ||
      (item.updatedAt || 0) > (merged.get(item.id).updatedAt || 0)
    )
      merged.set(item.id, item);
  return [...merged.values()]
    .map((e) => ({
      id: e.id,
      title: e.title,
      at: e.at,
      updatedAt: e.updatedAt || 0,
      repeat: e.repeat || "none",
      archived: Boolean(e.archived),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export async function syncReminders() {
  if (busy || !navigator.onLine) return;
  busy = true;
  try {
    const response = await fetch("/api/reminders", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      return;
    const remote = await response.json();
    const items = mergeLocal(remote.items, readReminders());
    if (JSON.stringify(items) === JSON.stringify(remote.items)) {
      localStorage.setItem(REMINDERS_KEY, JSON.stringify(items));
      localStorage.setItem("maison-panel:last-sync", String(Date.now()));
      document.dispatchEvent(new Event("maison-reminders"));
      return;
    }
    const written = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(10000),
    });
    if (!written.ok) return;
    const result = await written.json();
    // Preserve edits made while the network request was in flight; the next sync uploads them.
    localStorage.setItem(
      REMINDERS_KEY,
      JSON.stringify(mergeLocal(result.items, readReminders())),
    );
    localStorage.setItem("maison-panel:last-sync", String(Date.now()));
    document.dispatchEvent(new Event("maison-reminders"));
  } finally {
    busy = false;
  }
}
