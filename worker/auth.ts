import { betterAuth } from "better-auth";
import type { Env } from "./types";

// Better Auth 1.7 原生支援 D1（底層 Kysely 的 D1SqliteDialect）。
function createAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // 本機開發：wrangler dev 會用 routes 的網域當 Host，Vite (5173) 轉發時 Origin 會是它。
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://stock.example.com",
    ],
    emailAndPassword: {
      enabled: true,
      // 單人使用：關閉公開註冊，只有既有帳號能登入。
      disableSignUp: true,
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

// 每個 isolate 建一次即可；env 在同一個 isolate 內是穩定的。
let cached: Auth | undefined;

export function getAuth(env: Env): Auth {
  if (!cached) cached = createAuth(env);
  return cached;
}
