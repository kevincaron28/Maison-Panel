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
const SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing";
const TOKEN_KEY = "maison-panel:spotify-tokens";
const VERIFIER_KEY = "spotify-pkce-verifier";
const STATE_KEY = "spotify-pkce-state";

function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function sha256Base64Url(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
  localStorage.removeItem(TOKEN_KEY);
}

async function exchangeCodeForTokens(clientId, code) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: clientId,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`spotify token exchange ${res.status}`);
  const data = await res.json();
  saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
}

async function refreshTokens(clientId, tokens) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: clientId,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`spotify token refresh ${res.status}`);
  const data = await res.json();
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
  const code = params.get("code");
  if (!code) return;
  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  const gotState = params.get("state");
  history.replaceState(null, "", redirectUri());
  if (!expectedState || gotState !== expectedState) {
    console.warn("[spotify] state mismatch on auth redirect, ignoring code");
    return;
  }
  try {
    await exchangeCodeForTokens(clientId, code);
  } catch (err) {
    console.warn("[spotify] token exchange failed", err);
  }
}

async function getValidAccessToken(clientId) {
  let tokens = loadTokens();
  if (!tokens) return null;
  if (Date.now() > tokens.expiresAt - 60 * 1000) {
    try {
      tokens = await refreshTokens(clientId, tokens);
    } catch (err) {
      console.warn("[spotify] refresh failed, signing out", err);
      clearTokens();
      return null;
    }
  }
  return tokens.accessToken;
}

async function apiRequest(method, path, accessToken, params) {
  const url = new URL(API_BASE + path);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new Error("unauthorized");
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) throw new Error(`spotify api ${method} ${path} ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
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
    return;
  }

  if (state.status === "idle") {
    body.innerHTML = `<div class="spotify-idle">Rien en lecture</div>`;
    return;
  }

  const meta = document.createElement("div");
  meta.className = "spotify-meta";
  meta.innerHTML =
    `<div class="spotify-track"></div>` + `<div class="spotify-artist"></div>`;
  meta.querySelector(".spotify-track").textContent = state.track.name;
  meta.querySelector(".spotify-artist").textContent = `${state.track.artists} · ${state.deviceName}`;
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
  playBtn.addEventListener("click", state.isPlaying ? actions.pause : actions.play);

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

  const state = { status: "signed-out", volumePercent: 50 };

  async function pollNowPlaying() {
    const token = await getValidAccessToken(cfg.clientId);
    if (!token) {
      state.status = "signed-out";
      render(root, state, actions);
      return;
    }
    try {
      const data = await apiRequest("GET", "", token);
      if (!data || !data.item) {
        state.status = "idle";
      } else {
        state.status = "playing";
        state.isPlaying = data.is_playing;
        state.track = { name: data.item.name, artists: data.item.artists.map((a) => a.name).join(", ") };
        state.deviceName = data.device?.name || "";
        if (typeof data.device?.volume_percent === "number") state.volumePercent = data.device.volume_percent;
      }
      render(root, state, actions);
    } catch (err) {
      console.warn("[spotify] now-playing poll failed", err);
      // leave the last-rendered state on screen — one failed poll shouldn't blank the tile
    }
  }

  async function act(run) {
    const token = await getValidAccessToken(cfg.clientId);
    if (!token) return;
    try {
      await run(token);
    } catch (err) {
      console.warn("[spotify] control action failed", err);
    }
    pollNowPlaying();
  }

  const actions = {
    login: () => beginLogin(cfg.clientId),
    play: () => act((token) => apiRequest("PUT", "/play", token)),
    pause: () => act((token) => apiRequest("PUT", "/pause", token)),
    previous: () => act((token) => apiRequest("POST", "/previous", token)),
    next: () => act((token) => apiRequest("POST", "/next", token)),
    volume: (delta) =>
      act(async (token) => {
        const next = Math.max(0, Math.min(100, state.volumePercent + delta));
        await apiRequest("PUT", "/volume", token, { volume_percent: next });
        state.volumePercent = next;
      }),
  };

  async function tick() {
    await pollNowPlaying();
    setTimeout(tick, cfg.refresh);
  }

  (async () => {
    await consumeAuthRedirect(cfg.clientId);
    tick();
  })();
}
