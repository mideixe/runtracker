const MILES_PER_METER = 0.000621371;
const DEFAULT_SCOPE = "activity:read";
const RUN_SPORTS = new Set(["Run", "TrailRun", "VirtualRun"]);

export async function onRequest(context) {
  const { request, env } = context;

  try {
    assertConfigured(env);
    await ensureSchema(env.DB);

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, "");
    const parts = path.split("/").filter(Boolean);

    if (request.method === "OPTIONS") return emptyResponse();
    if (request.method === "GET" && path === "health") return json({ ok: true });
    if (request.method === "GET" && path === "state") return json(await getState(env));
    if (request.method === "POST" && path === "runners") return createRunner(request, env);
    if (request.method === "POST" && path === "sync") return syncAll(env);
    if (request.method === "GET" && path === "strava/connect") return connectStrava(request, env);
    if (request.method === "GET" && path === "strava/callback") return stravaCallback(request, env);

    if (parts[0] === "runners" && parts[1]) {
      const runnerId = parts[1];
      if (request.method === "POST" && parts[2] === "manual") return addManualRun(request, env, runnerId);
      if (request.method === "POST" && parts[2] === "disconnect") return setRunnerActive(env, runnerId, false);
      if (request.method === "POST" && parts[2] === "reconnect") return setRunnerActive(env, runnerId, true);
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error.message || "Unexpected server error" }, error.status || 500);
  }
}

function assertConfigured(env) {
  if (!env.DB) throw httpError("Missing Cloudflare D1 binding named DB.", 500);
  if (!env.STRAVA_CLIENT_ID) throw httpError("Missing STRAVA_CLIENT_ID environment variable.", 500);
  if (!env.STRAVA_CLIENT_SECRET) throw httpError("Missing STRAVA_CLIENT_SECRET secret.", 500);
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS runners (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        strava_connected INTEGER NOT NULL DEFAULT 0,
        strava_athlete_id INTEGER UNIQUE,
        scope TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS strava_tokens (
        runner_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (runner_id) REFERENCES runners(id) ON DELETE CASCADE
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        runner_id TEXT NOT NULL,
        source TEXT NOT NULL,
        strava_activity_id INTEGER UNIQUE,
        name TEXT,
        date TEXT NOT NULL,
        miles REAL NOT NULL,
        minutes INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (runner_id) REFERENCES runners(id) ON DELETE CASCADE
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        runner_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (runner_id) REFERENCES runners(id) ON DELETE CASCADE
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_runs_runner_id ON runs(runner_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_runs_date ON runs(date)"),
  ]);
}

async function getState(env) {
  const runnerRows = await env.DB.prepare(
    "SELECT id, name, age, active, strava_connected, strava_athlete_id, scope FROM runners ORDER BY created_at ASC",
  ).all();
  const runRows = await env.DB.prepare(
    "SELECT runner_id, source, date, miles, minutes FROM runs ORDER BY date ASC, created_at ASC",
  ).all();

  const runsByRunner = new Map();
  for (const run of runRows.results || []) {
    if (!runsByRunner.has(run.runner_id)) runsByRunner.set(run.runner_id, []);
    runsByRunner.get(run.runner_id).push({
      date: run.date,
      miles: Number(run.miles),
      minutes: Number(run.minutes),
      source: run.source,
    });
  }

  return {
    runners: (runnerRows.results || []).map((runner) => ({
      id: runner.id,
      name: runner.name,
      age: Number(runner.age),
      active: Boolean(runner.active),
      stravaConnected: Boolean(runner.strava_connected),
      stravaAthleteId: runner.strava_athlete_id,
      scope: runner.scope || "",
      runs: runsByRunner.get(runner.id) || [],
    })),
  };
}

async function createRunner(request, env) {
  const body = await readJson(request);
  const name = String(body.name || "").trim();
  const age = Number(body.age);
  const connectStrava = Boolean(body.connectStrava);

  if (!name) throw httpError("Runner name is required.", 400);
  if (!Number.isInteger(age) || age < 8 || age > 99) throw httpError("Runner age must be 8-99.", 400);

  const runnerId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO runners (id, name, age, active, strava_connected) VALUES (?, ?, ?, 1, 0)",
  )
    .bind(runnerId, name, age)
    .run();

  if (connectStrava) {
    return json({
      connectUrl: await createStravaAuthorizeUrl(env, new URL(request.url), runnerId),
    });
  }

  return json(await getState(env));
}

async function connectStrava(request, env) {
  const url = new URL(request.url);
  const runnerId = url.searchParams.get("runnerId");
  if (!runnerId) throw httpError("Missing runnerId.", 400);

  const runner = await env.DB.prepare("SELECT id FROM runners WHERE id = ?").bind(runnerId).first();
  if (!runner) throw httpError("Runner not found.", 404);

  return Response.redirect(await createStravaAuthorizeUrl(env, url, runnerId), 302);
}

async function createStravaAuthorizeUrl(env, requestUrl, runnerId) {
  const state = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO oauth_states (state, runner_id, created_at) VALUES (?, ?, ?)")
    .bind(state, runnerId, now)
    .run();

  const authorizeUrl = new URL("https://www.strava.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.STRAVA_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", `${requestUrl.origin}/api/strava/callback`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("approval_prompt", "auto");
  authorizeUrl.searchParams.set("scope", env.STRAVA_SCOPE || DEFAULT_SCOPE);
  authorizeUrl.searchParams.set("state", state);
  return authorizeUrl.toString();
}

async function stravaCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const acceptedScope = url.searchParams.get("scope") || "";

  if (url.searchParams.get("error")) {
    return Response.redirect(`${url.origin}/?strava=denied`, 302);
  }
  if (!code || !state) throw httpError("Missing Strava code or state.", 400);

  const stateRow = await env.DB.prepare("SELECT runner_id FROM oauth_states WHERE state = ?")
    .bind(state)
    .first();
  if (!stateRow) throw httpError("Invalid or expired Strava state.", 400);

  const tokenData = await exchangeCodeForToken(env, code);
  const athlete = tokenData.athlete || {};

  await env.DB.prepare(
    `UPDATE runners
     SET strava_connected = 1, strava_athlete_id = ?, scope = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(athlete.id || null, acceptedScope || tokenData.scope || "", stateRow.runner_id)
    .run();

  await env.DB.prepare(
    `INSERT INTO strava_tokens (runner_id, access_token, refresh_token, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(runner_id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(stateRow.runner_id, tokenData.access_token, tokenData.refresh_token, tokenData.expires_at)
    .run();

  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  await syncRunner(env, stateRow.runner_id);

  return Response.redirect(`${url.origin}/?strava=connected`, 302);
}

async function exchangeCodeForToken(env, code) {
  return stravaTokenRequest({
    client_id: env.STRAVA_CLIENT_ID,
    client_secret: env.STRAVA_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
  });
}

async function refreshToken(env, tokenRow) {
  const data = await stravaTokenRequest({
    client_id: env.STRAVA_CLIENT_ID,
    client_secret: env.STRAVA_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: tokenRow.refresh_token,
  });

  await env.DB.prepare(
    `UPDATE strava_tokens
     SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE runner_id = ?`,
  )
    .bind(data.access_token, data.refresh_token, data.expires_at, tokenRow.runner_id)
    .run();

  return { ...tokenRow, ...data };
}

async function stravaTokenRequest(params) {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });

  const data = await response.json();
  if (!response.ok) throw httpError(data.message || "Strava token request failed.", response.status);
  return data;
}

async function syncAll(env) {
  const rows = await env.DB.prepare("SELECT runner_id FROM strava_tokens").all();
  for (const row of rows.results || []) {
    await syncRunner(env, row.runner_id);
  }
  return json(await getState(env));
}

async function syncRunner(env, runnerId) {
  let tokenRow = await env.DB.prepare(
    "SELECT runner_id, access_token, refresh_token, expires_at FROM strava_tokens WHERE runner_id = ?",
  )
    .bind(runnerId)
    .first();

  if (!tokenRow) return;

  const now = Math.floor(Date.now() / 1000);
  if (Number(tokenRow.expires_at) <= now + 300) {
    tokenRow = await refreshToken(env, tokenRow);
  }

  for (let page = 1; page <= 5; page += 1) {
    const activitiesUrl = new URL("https://www.strava.com/api/v3/athlete/activities");
    activitiesUrl.searchParams.set("page", String(page));
    activitiesUrl.searchParams.set("per_page", "100");

    const response = await fetch(activitiesUrl, {
      headers: { Authorization: `Bearer ${tokenRow.access_token}` },
    });

    const activities = await response.json();
    if (!response.ok) throw httpError(activities.message || "Strava activity sync failed.", response.status);
    if (!Array.isArray(activities) || activities.length === 0) break;

    const inserts = activities.filter(isRunActivity).map((activity) => {
      const miles = Number((Number(activity.distance || 0) * MILES_PER_METER).toFixed(2));
      const minutes = Math.max(1, Math.round(Number(activity.moving_time || activity.elapsed_time || 0) / 60));
      const date = String(activity.start_date_local || activity.start_date || "").slice(0, 10);

      return env.DB.prepare(
        `INSERT INTO runs (id, runner_id, source, strava_activity_id, name, date, miles, minutes)
         VALUES (?, ?, 'Strava', ?, ?, ?, ?, ?)
         ON CONFLICT(strava_activity_id) DO UPDATE SET
           name = excluded.name,
           date = excluded.date,
           miles = excluded.miles,
           minutes = excluded.minutes`,
      ).bind(
        `strava-${activity.id}`,
        runnerId,
        activity.id,
        activity.name || "Strava run",
        date,
        miles,
        minutes,
      );
    });

    if (inserts.length) await env.DB.batch(inserts);
    if (activities.length < 100) break;
  }
}

function isRunActivity(activity) {
  return RUN_SPORTS.has(activity.sport_type) || RUN_SPORTS.has(activity.type);
}

async function addManualRun(request, env, runnerId) {
  const body = await readJson(request);
  const miles = Number(body.miles);
  const minutes = Number(body.minutes);

  if (!Number.isFinite(miles) || miles <= 0) throw httpError("Manual miles must be greater than 0.", 400);
  if (!Number.isInteger(minutes) || minutes <= 0) throw httpError("Manual time must be greater than 0 minutes.", 400);

  await env.DB.prepare(
    "INSERT INTO runs (id, runner_id, source, date, miles, minutes) VALUES (?, ?, 'Manual', ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), runnerId, new Date().toISOString().slice(0, 10), miles, minutes)
    .run();

  return json(await getState(env));
}

async function setRunnerActive(env, runnerId, active) {
  await env.DB.prepare("UPDATE runners SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(active ? 1 : 0, runnerId)
    .run();
  return json(await getState(env));
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError("Expected a JSON request body.", 400);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function emptyResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function httpError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}
