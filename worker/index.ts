import { Hono } from "hono";
import { getAuth } from "./auth";
import { cachedJson } from "./cache";
import { getDailyOHLCV } from "./market";
import { ensureSecurities, searchSecurities } from "./securities";
import type { Env } from "./types";

type Variables = { userId: string };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Better Auth 掛在 /api/auth/*
app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

app.get("/api/health", (c) => c.json({ ok: true }));

// 其餘 /api/* 一律要登入（整站鎖）。
app.use("/api/*", async (c, next) => {
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// 目前登入者
app.get("/api/me", async (c) => {
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  return c.json({ user: session!.user });
});

// 日線 OHLCV（FinMind 主、TWSE 備援；Cache API 快取）
app.get("/api/ohlcv", async (c) => {
  const market = (c.req.query("market") ?? "TW").toUpperCase();
  const symbol = c.req.query("symbol") ?? "0000";
  const to = c.req.query("to") ?? new Date().toISOString().slice(0, 10);
  const from = c.req.query("from") ?? defaultFrom(to);
  const security = { market, symbol };
  const key = `https://stocknote.internal/api/ohlcv?market=${market}&symbol=${symbol}&from=${from}&to=${to}`;

  try {
    const { body, cached } = await cachedJson(key, c.executionCtx, () =>
      getDailyOHLCV(security, from, to, { token: c.env.FINMIND_TOKEN }),
    );
    return c.json({ market, symbol, from, to, cached, ...body });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      502,
    );
  }
});

// 使用者偏好（指標開關、預設區間）
app.get("/api/prefs", async (c) => {
  const row = await c.env.DB.prepare(
    "select prefs_json from user_prefs where user_id = ?",
  )
    .bind(c.get("userId"))
    .first<{ prefs_json: string }>();
  return c.json({ prefs: row ? JSON.parse(row.prefs_json) : null });
});

app.put("/api/prefs", async (c) => {
  const body = await c.req.json<{ prefs?: unknown }>().catch(() => ({ prefs: undefined }));
  await c.env.DB.prepare(
    `insert into user_prefs (user_id, prefs_json, updated_at)
     values (?, ?, ?)
     on conflict(user_id) do update set prefs_json = excluded.prefs_json, updated_at = excluded.updated_at`,
  )
    .bind(c.get("userId"), JSON.stringify(body.prefs ?? {}), Date.now())
    .run();
  return c.json({ ok: true });
});

// 證券搜尋（代號或名稱）＋收藏清單
app.get("/api/securities", async (c) => {
  await ensureSecurities(c.env);
  const results = await searchSecurities(c.env, c.req.query("q") ?? "");
  return c.json({ results });
});

app.get("/api/favorites", async (c) => {
  await ensureSecurities(c.env);
  const { results } = await c.env.DB.prepare(
    `select f.id, f.market, f.symbol, f.sort_order as sortOrder,
            coalesce(s.name, f.symbol) as name, coalesce(s.kind, 'stock') as kind
     from favorites f
     left join securities s on s.market = f.market and s.symbol = f.symbol
     where f.user_id = ?
     order by f.sort_order`,
  )
    .bind(c.get("userId"))
    .all();
  return c.json({ favorites: results });
});

app.post("/api/favorites", async (c) => {
  const body = await c.req
    .json<{ market?: string; symbol?: string }>()
    .catch(() => ({}) as { market?: string; symbol?: string });
  const market = (body.market ?? "TW").toUpperCase();
  const symbol = String(body.symbol ?? "").trim();
  if (!symbol) return c.json({ error: "symbol required" }, 400);
  const userId = c.get("userId");
  const max = await c.env.DB.prepare(
    "select coalesce(max(sort_order), -1) as m from favorites where user_id = ?",
  )
    .bind(userId)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    `insert into favorites (id, user_id, market, symbol, sort_order, created_at)
     values (?, ?, ?, ?, ?, ?)
     on conflict(user_id, market, symbol) do nothing`,
  )
    .bind(crypto.randomUUID(), userId, market, symbol, (max?.m ?? -1) + 1, Date.now())
    .run();
  return c.json({ ok: true });
});

app.delete("/api/favorites/:id", async (c) => {
  await c.env.DB.prepare("delete from favorites where id = ? and user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  return c.json({ ok: true });
});

app.patch("/api/favorites/order", async (c) => {
  const body = await c.req
    .json<{ ids?: string[] }>()
    .catch(() => ({}) as { ids?: string[] });
  const userId = c.get("userId");
  const stmts = (body.ids ?? []).map((id, i) =>
    c.env.DB.prepare("update favorites set sort_order = ? where id = ? and user_id = ?").bind(
      i,
      id,
      userId,
    ),
  );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// 其餘交給靜態資源（SPA 由 not_found_handling: single-page-application 處理）
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

function defaultFrom(to: string): string {
  const [y, m, d] = to.split("-").map(Number);
  return `${y - 10}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default app;
