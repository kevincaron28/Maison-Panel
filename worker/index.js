export { CameraRelay } from "./camera-relay.js";
const encoder = new TextEncoder();
const SESSION = "__Host-maison-session";
const STATE = "__Host-maison-oauth";
const MAX_AGE = 90 * 86400;
const b64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const unb64 = (value) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (value) =>
  b64(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
async function key(env) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", encoder.encode(env.SESSION_SECRET)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(env),
    encoder.encode(JSON.stringify(value)),
  );
  return `${b64(iv)}.${b64(data)}`;
}
export async function unseal(value, env) {
  const [iv, data] = value.split(".");
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(iv) },
        await key(env),
        unb64(data),
      ),
    ),
  );
}
const cookie = (name, value, age) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function cookies(request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((v) => v.trim().split("="))
      .filter((v) => v.length === 2),
  );
}
const privateHeaders = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const json = (data, status = 200) =>
  Response.json(data, { status, headers: privateHeaders });
function redirect(url, values = []) {
  const headers = new Headers({ ...privateHeaders, Location: url });
  for (const value of values) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}
async function google(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error("Google request failed");
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}
async function exchange(params, env) {
  return google("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });
}
async function session(request, env) {
  const token = cookies(request)[SESSION];
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  const record = await env.PRIVATE_DATA.get(
    `session:${await digest(token)}`,
    "json",
  );
  if (!record || record.expires < Date.now()) return null;
  return record;
}
async function accessToken(sub, env) {
  const stored = await env.PRIVATE_DATA.get(`google:${sub}`);
  if (!stored) return null;
  const tokens = await unseal(stored, env);
  if (tokens.expires > Date.now() + 60000) return tokens.access;
  if (!tokens.refresh) return null;
  try {
    const data = await exchange(
      { grant_type: "refresh_token", refresh_token: tokens.refresh },
      env,
    );
    tokens.access = data.access_token;
    tokens.refresh = data.refresh_token || tokens.refresh;
    tokens.expires = Date.now() + data.expires_in * 1000;
    await env.PRIVATE_DATA.put(`google:${sub}`, await seal(tokens, env));
    return tokens.access;
  } catch (error) {
    if (error.code === "invalid_grant") {
      await env.PRIVATE_DATA.delete(`google:${sub}`);
      return null;
    }
    throw error;
  }
}
export function validReminders(items) {
  return (
    Array.isArray(items) &&
    items.length <= 1000 &&
    items.every(
      (e) =>
        e &&
        typeof e.id === "string" &&
        /^[\w-]{1,100}$/.test(e.id) &&
        typeof e.title === "string" &&
        e.title.length > 0 &&
        e.title.length <= 120 &&
        Number.isFinite(e.at) &&
        Number.isFinite(e.updatedAt) &&
        e.updatedAt <= Date.now() + 300000 &&
        [undefined, "none", "daily", "weekly", "monthly"].includes(e.repeat) &&
        [undefined, true, false].includes(e.archived),
    )
  );
}
export function mergeReminders(existing, incoming) {
  const map = new Map(existing.map((e) => [e.id, e]));
  for (const item of incoming)
    if (!map.has(item.id) || item.updatedAt > map.get(item.id).updatedAt)
      map.set(item.id, {
        id: item.id,
        title: item.title,
        at: item.at,
        updatedAt: item.updatedAt,
        repeat: item.repeat || "none",
        archived: Boolean(item.archived),
      });
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      if (url.pathname === "/") {
        url.pathname = "/index.html";
        return env.ASSETS.fetch(new Request(url, request));
      }
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === "/api/camera/publisher") {
      if (url.origin !== env.APP_ORIGIN || request.method !== "GET" ||
          !env.CAMERA_BRIDGE_SECRET || !env.CAMERA_RELAY ||
          await digest(request.headers.get("Authorization") || "") !== await digest(`Bearer ${env.CAMERA_BRIDGE_SECRET}`))
        return json({ error: "unauthorized" }, 401);
      return env.CAMERA_RELAY.getByName("home").fetch(request);
    }
    if (
      !env.PRIVATE_DATA ||
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !env.SESSION_SECRET ||
      !env.ALLOWED_EMAIL
    )
      return json({ error: "setup_required" }, 503);
    if (url.origin !== env.APP_ORIGIN)
      return json({ error: "wrong_origin" }, 403);
    if (
      request.method !== "GET" &&
      (request.headers.get("Origin") !== url.origin ||
        request.headers.get("Content-Type") !== "application/json")
    )
      return json({ error: "invalid_origin" }, 403);
    try {
      if (url.pathname === "/api/auth/start" && request.method === "GET") {
        const state = random(),
          verifier = random();
        const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        auth.search = new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          redirect_uri: `${env.APP_ORIGIN}/api/auth/callback`,
          response_type: "code",
          scope:
            "openid email https://www.googleapis.com/auth/calendar.events.readonly",
          state,
          code_challenge: await digest(verifier),
          code_challenge_method: "S256",
          access_type: "offline",
          prompt: "consent",
          login_hint: env.ALLOWED_EMAIL,
        }).toString();
        return redirect(auth.href, [
          cookie(
            STATE,
            await seal({ state, verifier, expires: Date.now() + 600000 }, env),
            600,
          ),
        ]);
      }
      if (url.pathname === "/api/auth/callback" && request.method === "GET") {
        let state;
        try {
          state = await unseal(cookies(request)[STATE] || "", env);
        } catch {
          return json({ error: "invalid_state" }, 400);
        }
        if (
          state.expires < Date.now() ||
          state.state !== url.searchParams.get("state")
        )
          return json({ error: "invalid_state" }, 400);
        if (url.searchParams.has("error"))
          return redirect("/settings.html?calendar=cancelled", [
            cookie(STATE, "", 0),
          ]);
        const code = url.searchParams.get("code");
        if (!code) return json({ error: "missing_code" }, 400);
        const data = await exchange(
          {
            code,
            code_verifier: state.verifier,
            grant_type: "authorization_code",
            redirect_uri: `${env.APP_ORIGIN}/api/auth/callback`,
          },
          env,
        );
        const user = await google(
          "https://openidconnect.googleapis.com/v1/userinfo",
          { headers: { Authorization: `Bearer ${data.access_token}` } },
        );
        if (
          !user.email_verified ||
          user.email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()
        )
          return redirect("/settings.html?calendar=account", [
            cookie(STATE, "", 0),
          ]);
        if (
          !data.scope
            ?.split(" ")
            .includes(
              "https://www.googleapis.com/auth/calendar.events.readonly",
            )
        )
          return redirect("/settings.html?calendar=scope", [
            cookie(STATE, "", 0),
          ]);
        const sub = await digest(user.sub);
        let old = null;
        const stored = await env.PRIVATE_DATA.get(`google:${sub}`);
        if (stored) old = await unseal(stored, env);
        await env.PRIVATE_DATA.put(
          `google:${sub}`,
          await seal(
            {
              access: data.access_token,
              refresh: data.refresh_token || old?.refresh,
              expires: Date.now() + data.expires_in * 1000,
            },
            env,
          ),
        );
        const token = random();
        await env.PRIVATE_DATA.put(
          `session:${await digest(token)}`,
          JSON.stringify({ sub, expires: Date.now() + MAX_AGE * 1000 }),
          { expirationTtl: MAX_AGE },
        );
        return redirect("/settings.html?calendar=connected", [
          cookie(SESSION, token, MAX_AGE),
          cookie(STATE, "", 0),
        ]);
      }
      const user = await session(request, env);
      if (!user) return json({ error: "sign_in_required" }, 401);
      if (url.pathname === "/api/camera/snapshot" && request.method === "GET") {
        if (!env.CAMERA_RELAY) return json({ error: "camera_unavailable" }, 503);
        return env.CAMERA_RELAY.getByName("home").fetch(request);
      }
      if (url.pathname === "/api/session" && request.method === "GET")
        return json({ connected: true });
      if (url.pathname === "/api/logout" && request.method === "POST") {
        await env.PRIVATE_DATA.delete(
          `session:${await digest(cookies(request)[SESSION])}`,
        );
        return new Response("{}", {
          headers: {
            ...privateHeaders,
            "Content-Type": "application/json",
            "Set-Cookie": cookie(SESSION, "", 0),
          },
        });
      }
      if (url.pathname === "/api/calendar" && request.method === "GET") {
        const token = await accessToken(user.sub, env);
        if (!token) return json({ error: "reconnect_required" }, 401);
        const calendar = new URL(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID || "primary")}/events`,
        );
        calendar.search = new URLSearchParams({
          timeMin: new Date().toISOString(),
          timeMax: new Date(Date.now() + 31 * 86400000).toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "50",
          timeZone: "America/Toronto",
          fields: "items(id,summary,start,end,htmlLink,status)",
        }).toString();
        const data = await google(calendar, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return json({
          events: (data.items || []).filter((e) => e.status !== "cancelled"),
          updatedAt: Date.now(),
        });
      }
      if (url.pathname === "/api/reminders") {
        const id = `reminders:${user.sub}`,
          raw = await env.PRIVATE_DATA.get(id);
        const existing = raw ? await unseal(raw, env) : [];
        if (request.method === "GET") return json({ items: existing });
        if (request.method === "POST") {
          if (Number(request.headers.get("Content-Length") || 0) > 300000)
            return json({ error: "too_large" }, 413);
          const body = await request.text();
          if (body.length > 300000) return json({ error: "too_large" }, 413);
          let items;
          try {
            items = JSON.parse(body).items;
          } catch {
            return json({ error: "invalid_json" }, 400);
          }
          if (!validReminders(items))
            return json({ error: "invalid_reminders" }, 400);
          const merged = mergeReminders(existing, items);
          if (merged.length > 1000)
            return json({ error: "too_many_reminders" }, 400);
          if (JSON.stringify(merged) !== JSON.stringify(existing))
            await env.PRIVATE_DATA.put(id, await seal(merged, env));
          return json({ items: merged });
        }
      }
      return json({ error: "not_found" }, 404);
    } catch {
      return json({ error: "temporarily_unavailable" }, 503);
    }
  },
};
