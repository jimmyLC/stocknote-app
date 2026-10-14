import { Hono } from "hono";
import { cachedJson } from "./cache";
import { getDailyOHLCV } from "./market";
import { taipeiToday } from "./marketData";
import type { Env } from "./types";

// 交易計畫：進場前寫好停損／停利，每天收盤後用收盤價檢查有沒有觸及。

export const trades = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

interface TradeRow {
  id: string;
  market: string;
  symbol: string;
  side: "long" | "short";
  status: "plan" | "open" | "closed" | "cancelled";
  strategy: string | null;
  reason: string | null;
  plan_date: string;
  entry_date: string | null;
  entry_price: number;
  shares: number;
  stop_price: number;
  target_price: number | null;
  exit_date: string | null;
  exit_price: number | null;
  exit_note: string | null;
  followed_plan: number | null;
  name: string;
}

const FIELDS = [
  "market",
  "symbol",
  "side",
  "status",
  "strategy",
  "reason",
  "plan_date",
  "entry_date",
  "entry_price",
  "shares",
  "stop_price",
  "target_price",
  "exit_date",
  "exit_price",
  "exit_note",
  "followed_plan",
] as const;

type Input = Partial<Record<(typeof FIELDS)[number], unknown>>;

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const pos = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;

/** 檢查並整理輸入；回傳錯誤訊息或乾淨的欄位。 */
function clean(input: Input, partial: boolean): string | Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (!(f in input)) continue;
    const v = input[f];
    out[f] = v === "" ? null : v;
  }
  if (out.market != null) out.market = String(out.market).toUpperCase();
  if (out.side != null && out.side !== "long" && out.side !== "short") return "方向只能是多或空";
  if (out.status != null && !["plan", "open", "closed", "cancelled"].includes(String(out.status)))
    return "狀態不正確";
  for (const f of ["plan_date", "entry_date", "exit_date"] as const) {
    if (out[f] != null && !isDate(out[f])) return "日期格式錯誤";
  }
  for (const f of ["entry_price", "stop_price", "target_price", "exit_price"] as const) {
    if (out[f] != null && !pos(out[f])) return "價格要大於 0";
  }
  if (out.shares != null && !(Number.isInteger(out.shares) && (out.shares as number) > 0))
    return "股數要是正整數";
  if (out.followed_plan != null) out.followed_plan = out.followed_plan ? 1 : 0;
  if (!partial) {
    if (!out.symbol) return "請選擇股票";
    if (!pos(out.entry_price) || !pos(out.stop_price) || !out.shares) return "進場價、停損價、股數必填";
  }
  return out;
}

/** 最近收盤（用同一份 /api/ohlcv 的快取邏輯，抓近 3 週即可）。 */
async function lastClose(
  env: Env,
  ctx: ExecutionContext,
  market: string,
  symbol: string,
): Promise<{ date: string; close: number } | null> {
  const to = taipeiToday();
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 21 * 864e5).toISOString().slice(0, 10);
  const key = `https://stocknote.internal/api/last?market=${market}&symbol=${symbol}&to=${to}`;
  try {
    const { body } = await cachedJson(key, ctx, () =>
      getDailyOHLCV({ market, symbol }, from, to, { token: env.FINMIND_TOKEN }),
    );
    const bar = body.bars.at(-1);
    return bar ? { date: bar.date, close: bar.close } : null;
  } catch {
    return null;
  }
}

trades.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `select t.*, coalesce(s.name, t.symbol) as name
     from trades t
     left join securities s on s.market = t.market and s.symbol = t.symbol
     where t.user_id = ?
     order by case t.status when 'open' then 0 when 'plan' then 1 when 'closed' then 2 else 3 end,
              coalesce(t.exit_date, t.entry_date, t.plan_date) desc, t.created_at desc`,
  )
    .bind(c.get("userId"))
    .all<TradeRow>();

  // 計畫中／持有中的：附上最新收盤，判斷有沒有觸及停損或停利。
  const active = results.filter((t) => t.status === "open" || t.status === "plan");
  const keys = [...new Set(active.map((t) => `${t.market}:${t.symbol}`))];
  const quotes = new Map(
    await Promise.all(
      keys.map(async (k) => {
        const [m, s] = k.split(":");
        return [k, await lastClose(c.env, c.executionCtx as ExecutionContext, m, s)] as const;
      }),
    ),
  );

  return c.json({
    trades: results.map((t) => {
      const q = quotes.get(`${t.market}:${t.symbol}`) ?? null;
      let alert: "stop" | "target" | null = null;
      if (q && t.status === "open") {
        const long = t.side === "long";
        if (long ? q.close <= t.stop_price : q.close >= t.stop_price) alert = "stop";
        else if (t.target_price && (long ? q.close >= t.target_price : q.close <= t.target_price))
          alert = "target";
      }
      return { ...t, last: q, alert };
    }),
  });
});

trades.post("/", async (c) => {
  const body = await c.req.json<Input>().catch(() => ({}) as Input);
  const v = clean(body, false);
  if (typeof v === "string") return c.json({ error: v }, 400);
  const now = Date.now();
  const id = crypto.randomUUID();
  const row = {
    side: "long",
    status: "plan",
    plan_date: taipeiToday(),
    ...v,
  } as Record<string, unknown>;
  const cols = Object.keys(row);
  await c.env.DB.prepare(
    `insert into trades (id, user_id, ${cols.join(", ")}, created_at, updated_at)
     values (?, ?, ${cols.map(() => "?").join(", ")}, ?, ?)`,
  )
    .bind(id, c.get("userId"), ...cols.map((k) => row[k] ?? null), now, now)
    .run();
  return c.json({ ok: true, id });
});

trades.patch("/:id", async (c) => {
  const body = await c.req.json<Input>().catch(() => ({}) as Input);
  const v = clean(body, true);
  if (typeof v === "string") return c.json({ error: v }, 400);
  const cols = Object.keys(v);
  if (cols.length === 0) return c.json({ ok: true });
  await c.env.DB.prepare(
    `update trades set ${cols.map((k) => `${k} = ?`).join(", ")}, updated_at = ?
     where id = ? and user_id = ?`,
  )
    .bind(...cols.map((k) => v[k] ?? null), Date.now(), c.req.param("id"), c.get("userId"))
    .run();
  return c.json({ ok: true });
});

trades.delete("/:id", async (c) => {
  await c.env.DB.prepare("delete from trades where id = ? and user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  return c.json({ ok: true });
});
