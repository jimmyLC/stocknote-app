import type { Env } from "./types";

// 本機開發跳過登入：.dev.vars 設 DEV_SKIP_AUTH=1 才會開。
// 雙重保險：BETTER_AUTH_URL 必須是 localhost（正式環境是 https://stock.example.com，永遠不會生效）。
export function devSkipAuth(env: Env): boolean {
  const on = env.DEV_SKIP_AUTH === "1" || env.DEV_SKIP_AUTH === "true";
  return on && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.BETTER_AUTH_URL);
}

interface DevUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: null;
  createdAt: string;
  updatedAt: string;
}

// 用本機資料庫裡最早建立的帳號（保留既有的本機筆記）；一個都沒有就建一個。
export async function getDevUser(env: Env): Promise<DevUser> {
  let row = await env.DB.prepare(
    'select id, name, email, "createdAt", "updatedAt" from "user" order by "createdAt" limit 1',
  ).first<{ id: string; name: string; email: string; createdAt: string; updatedAt: string }>();
  if (!row) {
    const now = new Date().toISOString();
    row = { id: "local-dev", name: "本機測試", email: "local-dev@localhost", createdAt: now, updatedAt: now };
    await env.DB.prepare(
      'insert or ignore into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (?, ?, ?, 1, ?, ?)',
    )
      .bind(row.id, row.name, row.email, now, now)
      .run();
  }
  return { ...row, emailVerified: true, image: null };
}

// 給前端 useSession() 用的假 session（形狀同 Better Auth 的 get-session 回應）。
export async function devSession(env: Env) {
  const user = await getDevUser(env);
  const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString();
  return {
    user,
    session: {
      id: "local-dev-session",
      userId: user.id,
      token: "local-dev",
      expiresAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      ipAddress: null,
      userAgent: null,
    },
  };
}
