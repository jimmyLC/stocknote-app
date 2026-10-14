export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  /** 選用：FinMind token，可把免費額度從 300 次/小時提高到 600。 */
  FINMIND_TOKEN?: string;
  /** 僅本機開發用：設為 "1" 可暫時開放註冊。正式環境不設 = 關閉註冊。 */
  ALLOW_SIGNUP?: string;
  /** 僅本機開發用：設為 "1" 跳過登入（只在 BETTER_AUTH_URL 是 localhost 時生效）。 */
  DEV_SKIP_AUTH?: string;
}
