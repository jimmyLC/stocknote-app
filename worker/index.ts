import { Hono } from "hono";
import { getAuth } from "./auth";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Better Auth 掛在 /api/auth/*
app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

app.get("/api/health", (c) => c.json({ ok: true }));

// 目前登入者
app.get("/api/me", async (c) => {
  const session = await getAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) return c.json({ user: null }, 401);
  return c.json({ user: session.user });
});

// 其餘交給靜態資源（SPA 由 not_found_handling: single-page-application 處理）
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
