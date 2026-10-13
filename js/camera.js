// Camera tile — Phase 5 (docs/project-brief.md §5.5). HTTP snapshot polling per feed: an <img>
// pointed at a LAN snapshot URL, src swapped on an interval with a cache-busting query param —
// brief §5.5 option 1 (no browser can play RTSP, this is the workaround). Each feed fails and
// recovers independently; there's no persistent connection to "reconnect," so a feed that comes
// back online just starts succeeding on its next poll tick.
let overlay = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "camera-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <button class="camera-overlay-close" aria-label="close">&times;</button>
    <div class="camera-overlay-name"></div>
    <img class="camera-overlay-img" alt="" />
  `;
  overlay
    .querySelector(".camera-overlay-close")
    .addEventListener("click", closeOverlay);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) { event.preventDefault(); closeOverlay(); }
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  document.body.appendChild(overlay);
  return overlay;
}

function closeOverlay() {
  if (overlay) overlay.hidden = true;
}

function openOverlay(feed, currentSrc) {
  const el = ensureOverlay();
  const dialog = document.getElementById("camera-dialog");
  if (dialog?.open) dialog.appendChild(el);
  el.dataset.feedId = feed.id;
  el.querySelector(".camera-overlay-name").textContent = feed.name;
  // Seed from the thumbnail's already-loaded image immediately — otherwise the overlay shows a
  // broken-image icon until the next poll tick (up to refreshMs later) sets a src for the first time.
  if (currentSrc) el.querySelector(".camera-overlay-img").src = currentSrc;
  el.hidden = false;
}

function snapshotUrl(feed) {
  return `${feed.snapshotUrl}${feed.snapshotUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

function initFeed(config, root, feed) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "camera-feed";
  card.innerHTML = `
    <img class="camera-feed-img" alt="" />
    <div class="camera-feed-label"></div>
    <div class="camera-feed-status">connexion…</div>
  `;
  root.appendChild(card);
  card.querySelector(".camera-feed-label").textContent = feed.name;
  card.setAttribute("aria-label", `Agrandir ${feed.name}`);

  const img = card.querySelector(".camera-feed-img");
  const status = card.querySelector(".camera-feed-status");

  card.addEventListener("click", () => openOverlay(feed, img.src));

  function setState(state) {
    card.classList.toggle("is-offline", state === "offline");
    status.hidden = state !== "offline";
    status.textContent = state === "offline" ? "hors ligne" : "";
  }

  let timer, failures=0, pending=null, objectUrl=null;
  const visible=()=>!document.hidden && !root.closest("[hidden]") && (!root.closest("dialog") || root.closest("dialog").open);
  function schedule(){clearTimeout(timer);timer=setTimeout(tick,Math.min(60000,(feed.refreshMs||config.refresh.camera)*2**failures));}
  function clearPrivate() {
    pending?.abort(); pending=null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl=null;
    img.removeAttribute("src");
    if (overlay?.dataset.feedId === feed.id) overlay.querySelector(".camera-overlay-img").removeAttribute("src");
  }
  async function tick() {
    if(!visible()) return;
    if(pending) return;
    let url = snapshotUrl(feed);
    if(feed.private) {
      const controller = new AbortController(); pending=controller;
      const timeout=setTimeout(()=>controller.abort(),15000);
      try {
        const response=await fetch(url,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
        if(!response.ok) {
          const denied=response.status===401;
          clearPrivate(); failures=Math.min(failures+1,5);
          setState("offline");
          status.textContent=denied?"Connectez-vous dans Réglages pour voir la caméra.":"Caméra indisponible · vérifiez le PC et le câble réseau.";
          schedule(); return;
        }
        if(!response.headers.get("Content-Type")?.includes("image/jpeg")) throw new Error("Invalid image");
        const blob=await response.blob();
        if(controller.signal.aborted || !visible()) return;
        if(objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl=URL.createObjectURL(blob); url=objectUrl;
      } catch {
        if(controller.signal.aborted && !visible()) return;
        clearPrivate(); failures=Math.min(failures+1,5); setState("offline"); schedule(); return;
      } finally { clearTimeout(timeout); if(pending===controller) pending=null; }
    }
    img.src = url;
    if (overlay && !overlay.hidden && overlay.dataset.feedId === feed.id) {
      overlay.querySelector(".camera-overlay-img").src = url;
    }
  }

  img.addEventListener("load", () => {failures=0;setState("live");schedule();});
  img.addEventListener("error", () => {failures=Math.min(failures+1,5);setState("offline");schedule();});

  const visibility=()=>{clearTimeout(timer);if(feed.private&&!visible())clearPrivate();else tick();};
  document.addEventListener("visibilitychange",visibility);
  document.addEventListener("maison-camera-visibility",visibility);
  if(feed.private) {
    window.addEventListener("pagehide",()=>{clearTimeout(timer);clearPrivate();});
    window.addEventListener("pageshow",visibility);
    window.addEventListener("storage",event=>{if(event.key==="maison-panel:logout"){clearTimeout(timer);clearPrivate();setState("offline");}});
  }
  tick();
}

export function initCamera(config, root) {
  const feeds = (config.camera?.feeds || []).filter(
    (f) => f.enabled !== false && f.snapshotUrl,
  );
  if (feeds.length === 0) return;
  root.hidden = false;

  for (const feed of feeds) {
    if (
      location.protocol === "https:" &&
      new URL(feed.snapshotUrl, location.href).protocol !== "https:"
    ) {
      const notice = document.createElement("p");
      notice.textContent = `${feed.name} : une adresse HTTPS est requise sur ce panneau.`;
      root.querySelector(".camera-feeds").appendChild(notice);
    } else {
      initFeed(config, root.querySelector(".camera-feeds"), feed);
    }
  }
}
