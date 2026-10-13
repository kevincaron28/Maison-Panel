import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  seal,
  unseal,
  mergeReminders,
  validReminders,
} from "../worker/index.js";

function environment() {
  const records = new Map();
  return {
    APP_ORIGIN: "https://panel.test",
    ALLOWED_EMAIL: "owner@example.test",
    GOOGLE_CLIENT_ID: "fixture",
    GOOGLE_CLIENT_SECRET: "fixture-secret",
    SESSION_SECRET: "fixture-encryption-key",
    PRIVATE_DATA: {
      async get(k, type) {
        const v = records.get(k);
        return v && type === "json" ? JSON.parse(v) : v || null;
      },
      async put(k, v) {
        records.set(k, v);
      },
      async delete(k) {
        records.delete(k);
      },
    },
    ASSETS: { fetch: async () => new Response("static") },
    records,
  };
}
const request = (path, options = {}) =>
  new Request("https://panel.test" + path, options);
const scope = "https://www.googleapis.com/auth/calendar.events.readonly";
async function connect(t, env, email = "owner@example.test") {
  const start = await worker.fetch(request("/api/auth/start"), env);
  const auth = new URL(start.headers.get("Location"));
  const cookie = start.headers.get("set-cookie").split(";")[0];
  t.mock.method(globalThis, "fetch", async (url) =>
    String(url).includes("/token")
      ? Response.json({
          access_token: "private-access",
          refresh_token: "private-refresh",
          expires_in: 3600,
          scope,
        })
      : Response.json({ email, email_verified: true, sub: "owner-sub" }),
  );
  return worker.fetch(
    request(
      "/api/auth/callback?code=fixture&state=" + auth.searchParams.get("state"),
      { headers: { Cookie: cookie } },
    ),
    env,
  );
}

test("encrypted private storage round-trips and rejects tampering or another key", async () => {
  const env = environment(),
    data = { refresh: "private-refresh", items: [{ title: "Private" }] };
  const sealed = await seal(data, env);
  assert.ok(!sealed.includes("private-refresh"));
  assert.deepEqual(await unseal(sealed, env), data);
  await assert.rejects(unseal(sealed, { ...env, SESSION_SECRET: "different" }));
  const [iv, payload] = sealed.split(".");
  await assert.rejects(
    unseal(iv + "." + (payload[0] === "A" ? "B" : "A") + payload.slice(1), env),
  );
});
test("API blocks anonymous access and cross-origin mutations while keeping static assets public", async () => {
  const env = environment();
  assert.equal(await (await worker.fetch(request("/"), env)).text(), "static");
  for (const path of ["/api/calendar", "/api/reminders", "/api/session"]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("Cache-Control"), /no-store/);
  }
  assert.equal(
    (
      await worker.fetch(
        request("/api/reminders", {
          method: "POST",
          headers: {
            Origin: "https://attacker.test",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await worker.fetch(request("/api/auth/callback?code=bad&state=bad"), env))
      .status,
    400,
  );
});
test("OAuth uses PKCE, short state and secure cookies; another Google account cannot connect", async (t) => {
  const env = environment(),
    response = await worker.fetch(request("/api/auth/start"), env),
    url = new URL(response.headers.get("Location"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "openid email " + scope);
  assert.match(
    response.headers.get("set-cookie"),
    /HttpOnly; Secure; SameSite=Lax; Max-Age=600/,
  );
  const rejected = await connect(t, env, "stranger@example.test");
  assert.equal(
    rejected.headers.get("Location"),
    "/settings.html?calendar=account",
  );
  assert.equal(env.records.size, 0);
});
test("authorized owner can sync encrypted reminders, read calendar and end the session", async (t) => {
  const env = environment(),
    callback = await connect(t, env);
  assert.equal(
    callback.headers.get("Location"),
    "/settings.html?calendar=connected",
  );
  const cookie = callback.headers
    .getSetCookie()
    .find((c) => c.startsWith("__Host-maison-session="))
    .split(";")[0];
  const headers = {
    Cookie: cookie,
    Origin: env.APP_ORIGIN,
    "Content-Type": "application/json",
  };
  const items = [
    {
      id: "one",
      title: "Fixture reminder",
      at: Date.now() + 3600000,
      updatedAt: Date.now(),
      repeat: "weekly",
      archived: false,
    },
  ];
  const saved = await worker.fetch(
    request("/api/reminders", {
      method: "POST",
      headers,
      body: JSON.stringify({ items }),
    }),
    env,
  );
  assert.equal(saved.status, 200);
  assert.deepEqual(
    (
      await (
        await worker.fetch(request("/api/reminders", { headers }), env)
      ).json()
    ).items,
    items,
  );
  for (const [key, value] of env.records)
    if (!key.startsWith("session:"))
      assert.ok(
        !value.includes("Fixture reminder") &&
          !value.includes("private-refresh"),
      );
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer private-access");
    assert.equal(new URL(url).searchParams.get("singleEvents"), "true");
    return Response.json({
      items: [
        {
          id: "event",
          summary: "Fixture event",
          start: { date: "2026-10-14" },
        },
      ],
    });
  });
  const calendar = await worker.fetch(
    request("/api/calendar", { headers }),
    env,
  );
  assert.equal(calendar.status, 200);
  assert.equal((await calendar.json()).events.length, 1);
  await worker.fetch(
    request("/api/logout", { method: "POST", headers, body: "{}" }),
    env,
  );
  assert.equal(
    (await worker.fetch(request("/api/session", { headers }), env)).status,
    401,
  );
});
test("reminder merge preserves newer edits and archived tombstones", () => {
  const base = {
    id: "one",
    title: "Original",
    at: 1,
    updatedAt: 1,
    repeat: "none",
    archived: false,
  };
  const archived = { ...base, updatedAt: 3, archived: true };
  assert.deepEqual(mergeReminders([archived], [{ ...base, updatedAt: 2 }]), [
    archived,
  ]);
  assert.deepEqual(mergeReminders([base], [archived]), [archived]);
  assert.ok(validReminders([archived]));
  assert.ok(!validReminders([{ ...base, title: "x".repeat(121) }]));
  assert.ok(!validReminders([{ ...base, updatedAt: Date.now() + 600000 }]));
  assert.ok(!validReminders(new Array(1001).fill(base)));
});
