import { Hono } from "hono";
import { getAuth } from "./auth";
import { cachedJson } from "./cache";
import { getDailyOHLCV } from "./market";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Better Auth 掛在 /api/auth/*
app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

app.get("/api/health", (c) => c.json({ ok: true }));

// 其餘 /api/* 一律要登入（整站鎖）。
app.use("/api/*", async (c, next) => {
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  return next();
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

// 其餘交給靜態資源（SPA 由 not_found_handling: single-page-application 處理）
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

function defaultFrom(to: string): string {
  const [y, m, d] = to.split("-").map(Number);
  return `${y - 10}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default app;
