// Spotify Connect playback control (replaces the removed Google Home speaker bridge). Controls
// whichever device is already active in the Spotify account — a phone, a computer, or a Spotify
// Connect–enabled speaker — through Spotify's own cloud Web API. The tablet never plays audio
// itself (that's the Web Playback SDK, deliberately not used here).
//
// Auth is Authorization Code + PKCE: a public-client OAuth flow with no client secret, built for
// exactly this (a static site with no server to keep a secret on). One-time login happens in the
// browser (redirects to Spotify's consent screen and back), then access/refresh tokens live in
// localStorage and refresh themselves silently — same "no server, ever" rule as every other tile.

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1/me/player";
const SCOPES =
  "user-read-playback-state user-modify-playback-state user-read-currently-playing";
const TOKEN_KEY = "maison-panel:spotify-tokens";
const VERIFIER_KEY = "spotify-pkce-verifier";
const STATE_KEY = "spotify-pkce-state";
import { fetchJson } from "./network.js";
import { createMusicControls } from "./music-controls.js";
let refreshInFlight = null;
const retryAfterByClient = new Map();

export function redirectUri(page = location) {
  // One registered callback per origin. /index.html and query parameters must not
  // turn into different Spotify redirect URIs on Fully Kiosk.
  return `${page.origin}/`;
}

function randomString(length) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function sha256Base64Url(input) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest))
    binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function beginLogin(clientId) {
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const challenge = await sha256Base64Url(verifier);
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("state", state);
  location.href = url.toString();
}

function loadTokens() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    // storage full/unavailable — tokens just won't survive a reload this time
  }
}

function clearTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked */
  }
}

async function exchangeCodeForTokens(clientId, code) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("La session de connexion a expiré. Reconnectez Spotify dans ce même navigateur.");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: clientId,
    code_verifier: verifier,
  });
  const data = await fetchJson(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  sessionStorage.removeItem(VERIFIER_KEY);
}

async function refreshTokens(clientId, tokens) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: clientId,
  });
  const data = await fetchJson(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const next = {
    accessToken: data.access_token,
    // Spotify doesn't always rotate the refresh token — keep the old one if a new one isn't sent.
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  saveTokens(next);
  return next;
}

// Consumes ?code=&state= from the URL if this load is the redirect back from Spotify's consent
// screen, exchanges it for tokens, then strips those params from the address bar so a reload
// doesn't try to redeem an already-used code.
async function consumeAuthRedirect(clientId) {
  const params = new URLSearchParams(location.search);
  if (params.has("error")) {
    history.replaceState(null, "", redirectUri());
    throw new Error("Connexion Spotify annulée ou refusée. Vous pouvez réessayer.");
  }
  const code = params.get("code");
  if (!code) return;
  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  const gotState = params.get("state");
  history.replaceState(null, "", redirectUri());
  if (!expectedState || gotState !== expectedState) {
    throw new Error("Session Spotify expirée. Recommencez la connexion dans Fully Kiosk, sans changer de navigateur.");
  }
  try {
    await exchangeCodeForTokens(clientId, code);
  } catch (err) {
    throw new Error(`Connexion Spotify non terminée (${err.status || "réseau"}). Vérifiez le retour ${redirectUri()} dans Spotify Developer Dashboard.`);
  }
}

export async function getValidAccessToken(clientId) {
  let tokens = loadTokens();
  if (!tokens) return null;
  if (Date.now() > tokens.expiresAt - 60 * 1000) {
    try {
      if (!refreshInFlight)
        refreshInFlight = refreshTokens(clientId, tokens).finally(() => {
          refreshInFlight = null;
        });
      tokens = await refreshInFlight;
    } catch (err) {
      if (err.code === "invalid_grant") {
        clearTokens();
        return null;
      }
      throw err; // transient outages must not delete a reusable refresh token
    }
  }
  return tokens.accessToken;
}

async function apiRequest(method, path, accessToken, params, body) {
  const url = new URL(API_BASE + path);
  if (params)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? {"Content-Type":"application/json"} : {}) },
      ...(body ? {body: JSON.stringify(body)} : {}),
    });
    if (res.status === 401) {
      const error = new Error("unauthorized");
      error.status = 401;
      throw error;
    }
    if (res.status === 204 || res.status === 202) return null;
    if (!res.ok) {
      const error = new Error(`spotify api ${method} ${path} ${res.status}`);
      error.status = res.status;
      if (res.status === 429) {
        const seconds = Number(res.headers?.get("Retry-After"));
        error.retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 30000;
      }
      throw error;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestSpotify(clientId, method, path, params, body) {
  const remaining = (retryAfterByClient.get(clientId) || 0) - Date.now();
  if (remaining > 0) throw Object.assign(new Error("Spotify rate limit"), { status: 429, retryAfterMs: remaining });
  let token = await getValidAccessToken(clientId);
  if (!token) return { signedOut: true };
  try {
    return await apiRequest(method, path, token, params, body);
  } catch (err) {
    if (err.status === 429) retryAfterByClient.set(clientId, Date.now() + err.retryAfterMs);
    if (err.status !== 401) throw err;
    const saved = loadTokens();
    if (saved) saveTokens({ ...saved, expiresAt: 0 });
    token = await getValidAccessToken(clientId);
    if (!token) return { signedOut: true };
    try {
      return await apiRequest(method, path, token, params, body);
    } catch (retryError) {
      if (retryError.status === 429) retryAfterByClient.set(clientId, Date.now() + retryError.retryAfterMs);
      if (retryError.status === 401) { clearTokens(); return { signedOut: true }; }
      throw retryError;
    }
  }
}

function render(root, state, actions) {
  const body = root.querySelector(".spotify-body");
  body.innerHTML = "";

  if (state.status === "signed-out") {
    const btn = document.createElement("button");
    btn.className = "spotify-connect-btn";
    btn.textContent = "Connecter Spotify";
    btn.addEventListener("click", actions.login);
    body.appendChild(btn);
    const help = document.createElement("a");
    help.href = new URL("../settings.html#spotify", import.meta.url).href;
    help.className = "spotify-help";
    help.textContent = "Aide connexion";
    body.appendChild(help);
    return;
  }

  if (state.status === "idle") {
    body.innerHTML = `<div class="spotify-idle">Spotify connecté · lancez une musique sur votre téléphone ou votre enceinte.</div>`;
    return;
  }

  const meta = document.createElement("div");
  meta.className = "spotify-meta";
  meta.innerHTML =
    `<div class="spotify-track"></div>` + `<div class="spotify-artist"></div>`;
  meta.querySelector(".spotify-track").textContent = state.track.name;
  meta.querySelector(".spotify-artist").textContent =
    `${state.track.artists} · ${state.deviceName}`;
  body.appendChild(meta);

  const controls = document.createElement("div");
  controls.className = "spotify-controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "spotify-btn";
  prevBtn.setAttribute("aria-label", "Précédent");
  prevBtn.textContent = "⏮";
  prevBtn.addEventListener("click", actions.previous);

  const playBtn = document.createElement("button");
  playBtn.className = "spotify-btn spotify-btn-primary";
  playBtn.setAttribute("aria-label", state.isPlaying ? "Pause" : "Lecture");
  playBtn.textContent = state.isPlaying ? "⏸" : "▶";
  playBtn.addEventListener(
    "click",
    state.isPlaying ? actions.pause : actions.play,
  );

  const nextBtn = document.createElement("button");
  nextBtn.className = "spotify-btn";
  nextBtn.setAttribute("aria-label", "Suivant");
  nextBtn.textContent = "⏭";
  nextBtn.addEventListener("click", actions.next);

  controls.append(prevBtn, playBtn, nextBtn);
  body.appendChild(controls);

  const volume = document.createElement("div");
  volume.className = "spotify-volume";

  const volDownBtn = document.createElement("button");
  volDownBtn.className = "spotify-btn spotify-btn-small";
  volDownBtn.setAttribute("aria-label", "Volume moins");
  volDownBtn.textContent = "−";
  volDownBtn.addEventListener("click", () => actions.volume(-10));

  const volUpBtn = document.createElement("button");
  volUpBtn.className = "spotify-btn spotify-btn-small";
  volUpBtn.setAttribute("aria-label", "Volume plus");
  volUpBtn.textContent = "+";
  volUpBtn.addEventListener("click", () => actions.volume(10));
  volDownBtn.disabled = volUpBtn.disabled = state.supportsVolume === false || state.restricted || state.busy || state.unavailable;
  prevBtn.disabled = Boolean(state.busy || state.unavailable || state.restricted || state.disallows?.skipping_prev);
  nextBtn.disabled = Boolean(state.busy || state.unavailable || state.restricted || state.disallows?.skipping_next);
  playBtn.disabled = Boolean(state.busy || state.unavailable || state.restricted || state.disallows?.[state.isPlaying ? "pausing" : "resuming"]);

  volume.append(volDownBtn, volUpBtn);
  body.appendChild(volume);
}

export function initSpotify(config, root) {
  const cfg = config.spotify;
  if (!cfg?.clientId) {
    root.hidden = true;
    return;
  }
  root.hidden = false;

  const state = { status: "signed-out", volumePercent: 50, repeat: "off", disallows: {}, busy: false };
  let authError = "";
  let polling = null;
  let failures = 0;
  const more = document.createElement("button");
  more.type = "button";
  more.className = "music-more";
  more.textContent = "Commandes";
  more.hidden = true;
  root.appendChild(more);
  function paint() {
    // Preserve keyboard focus when the compact footer updates.
    const active = root.querySelector(".spotify-body")?.contains(document.activeElement)
      ? document.activeElement.getAttribute("aria-label") : null;
    render(root, state, actions);
    if (active) [...root.querySelectorAll("button[aria-label]")].find(b=>b.getAttribute("aria-label") === active)?.focus();
    more.hidden = state.status === "signed-out";
    root.querySelector(".spotify-status").textContent = state.feedback || "";
    music.update(state);
  }

  async function pollNowPlaying() {
    if (polling) return polling;
    polling = pollPlayback().finally(() => { polling = null; });
    return polling;
  }
  async function pollPlayback() {
    try {
      const data = await requestSpotify(cfg.clientId, "GET", "");
      failures = 0;
      state.unavailable = false;
      if (!state.busy) state.feedback = "";
      if (data?.signedOut) {
        state.status = "signed-out";
        state.feedback = authError;
        paint();
        return;
      }
      if (!data || !data.item) {
        state.status = "idle";
        state.isPlaying = false;
        state.deviceName = data?.device?.name || "";
        state.deviceId = data?.device?.id;
        state.restricted = Boolean(data?.device?.is_restricted);
        state.supportsVolume = data?.device?.supports_volume !== false;
        state.track = null;
        state.durationMs = state.progressMs = 0;
        state.artwork = null;
        state.shuffle = false;
        state.repeat = "off";
        state.disallows = {};
      } else {
        state.status = "playing";
        state.isPlaying = data.is_playing;
        state.track = {
          name: data.item.name,
          artists:
            (data.item.artists || []).map((a) => a.name).join(", ") ||
            data.item.show?.name ||
            "Spotify",
        };
        state.deviceName = data.device?.name || "";
        state.deviceId = data.device?.id;
        state.restricted = Boolean(data.device?.is_restricted);
        state.supportsVolume = data.device?.supports_volume !== false;
        state.shuffle = Boolean(data.shuffle_state);
        state.repeat = data.repeat_state || "off";
        state.durationMs = data.item.duration_ms || 0;
        state.progressMs = data.progress_ms || 0;
        state.artwork = data.item.album?.images?.[0]?.url || data.item.images?.[0]?.url;
        state.disallows = data.actions?.disallows || data.actions || {};
        if (typeof data.device?.volume_percent === "number")
          state.volumePercent = data.device.volume_percent;
      }
      paint();
    } catch (err) {
      failures++;
      state.unavailable = true;
      console.warn("[spotify] now-playing poll failed", err);
      if (err.message === "unauthorized") {
        const tokens = loadTokens();
        if (tokens) saveTokens({ ...tokens, expiresAt: 0 });
      }
      state.feedback = err.status === 429
        ? "Spotify demande une pause · reprise automatique après le délai."
        : err.code === "invalid_client"
        ? "Configuration Spotify à vérifier · Aide connexion"
        : "Spotify indisponible · nouvel essai automatique";
      paint();
      // leave the last-rendered state on screen — one failed poll shouldn't blank the tile
    }
  }

  async function act(method, path, params, body) {
    if (state.busy || state.unavailable || state.status === "signed-out") return;
    state.busy = true;
    state.feedback = "Envoi de la commande…";
    paint();
    try {
      // Do not let an older in-flight poll overwrite state after a command.
      if (polling) await polling;
      const result = await requestSpotify(cfg.clientId, method, path, params, body);
      if (result?.signedOut) {
        state.status = "signed-out";
        state.feedback = "Session expirée · reconnectez Spotify.";
        return;
      }
      state.feedback = "Commande envoyée";
      await pollNowPlaying();
      return true;
    } catch (err) {
      console.warn("[spotify] control action failed", err);
      state.feedback = err.status === 429
        ? "Spotify demande une pause · réessayez après le délai."
        : err.status === 403
        ? "Commande refusée · vérifiez Spotify Premium et l’accès à l’application."
        : err.status === 404
          ? "Aucun appareil actif · lancez Spotify sur votre enceinte ou téléphone."
          : "Commande non envoyée · réessayez après avoir vérifié la connexion.";
    } finally {
      state.busy = false;
      paint();
    }
  }

  const actions = {
    login: () =>
      beginLogin(cfg.clientId).catch(() => {
        root.querySelector(".spotify-status").textContent =
          "Connexion impossible. Vérifiez HTTPS et le stockage du navigateur.";
      }),
    play: () => act("PUT", "/play"),
    pause: () => act("PUT", "/pause"),
    previous: () => act("POST", "/previous"),
    next: () => act("POST", "/next"),
    volume: (delta) => actions.setVolume(state.volumePercent + delta),
    setVolume: (value) => act("PUT", "/volume", {volume_percent: Math.max(0, Math.min(100, Math.round(value)))}),
    seek: (value) => act("PUT", "/seek", {position_ms: Math.max(0, Math.min((state.durationMs || 1) - 1, Math.round(value)))}),
    shuffle: () => act("PUT", "/shuffle", {state: !state.shuffle}),
    repeat: () => act("PUT", "/repeat", {state: {off:"context",context:"track",track:"off"}[state.repeat] || "off"}),
    transfer: (id) => id && act("PUT", "", undefined, {device_ids:[id],play:Boolean(state.isPlaying)}),
    devices: async () => {
      try {
        const data = await requestSpotify(cfg.clientId, "GET", "/devices");
        if (data?.signedOut) {
          state.status = "signed-out";
          state.feedback = "Session expirée · reconnectez Spotify.";
          music.devices([]);
          paint();
          return;
        }
        music.devices(data?.devices || []);
      } catch {
        state.feedback = "Impossible de charger les appareils. Réessayez avec Actualiser.";
        paint();
      }
    },
  };
  const music = createMusicControls(root, actions);
  more.addEventListener("click", () => music.open());

  async function tick() {
    if (!state.busy) await pollNowPlaying();
    const base = Math.max(5000, cfg.refresh || 10000);
    const idleDelay = state.isPlaying && document.visibilityState !== "hidden" ? base : Math.max(base, 30000);
    const backoff = Math.min(300000, base * 2 ** Math.min(failures, 6));
    setTimeout(tick, Math.max(idleDelay, backoff, (retryAfterByClient.get(cfg.clientId) || 0) - Date.now()));
  }

  (async () => {
    paint();
    try {
      await consumeAuthRedirect(cfg.clientId);
    } catch (err) {
      console.warn("[spotify] login unavailable", err);
      authError = err.message;
    }
    tick();
  })();
}
