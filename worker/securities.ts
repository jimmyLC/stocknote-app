import { GLOBAL_INDICES } from "./indices";
import type { Env } from "./types";

const FINMIND_INFO = "https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo";
const ONE_DAY = 24 * 60 * 60 * 1000;

interface InfoRow {
  stock_id?: string;
  stock_name?: string;
  industry_category?: string;
}

export interface Security {
  market: string;
  symbol: string;
  name: string;
  kind: string;
}

/**
 * 確保 securities 主檔可用（台灣證券代號→名稱）。
 * 資料來源：FinMind TaiwanStockInfo；一天只更新一次。
 */
export async function ensureSecurities(env: Env): Promise<void> {
  await ensureGlobalIndices(env);
  const row = await env.DB.prepare("select max(updated_at) as m from securities").first<{
    m: number | null;
  }>();
  if (row?.m != null && row.m > Date.now() - ONE_DAY) return;

  const url = env.FINMIND_TOKEN
    ? `${FINMIND_INFO}&token=${env.FINMIND_TOKEN}`
    : FINMIND_INFO;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`);
  const json = (await res.json()) as { status: number; data?: InfoRow[] };
  if (json.status !== 200 || !json.data) throw new Error("FinMind TaiwanStockInfo 失敗");

  const now = Date.now();
  const insert = env.DB.prepare(
    `insert into securities (market, symbol, name, industry, kind, updated_at)
     values ('TW', ?, ?, ?, ?, ?)
     on conflict(market, symbol) do update set
       name = excluded.name, industry = excluded.industry,
       kind = excluded.kind, updated_at = excluded.updated_at`,
  );

  const stmts = [insert.bind("0000", "加權指數", "指數", "index", now)];
  const seen = new Set<string>(["0000"]);
  for (const r of json.data) {
    const symbol = String(r.stock_id ?? "").trim();
    const name = String(r.stock_name ?? "").trim();
    if (!symbol || !name || seen.has(symbol)) continue;
    seen.add(symbol);
    const kind = /^00/.test(symbol) ? "etf" : "stock";
    stmts.push(insert.bind(symbol, name, r.industry_category ?? null, kind, now));
  }

  for (let i = 0; i < stmts.length; i += 200) {
    await env.DB.batch(stmts.slice(i, i + 200));
  }
}

// 國際大盤是寫死的清單，數量變了（例如新增指數）才重寫。
async function ensureGlobalIndices(env: Env): Promise<void> {
  const row = await env.DB.prepare(
    "select count(*) as n from securities where market != 'TW'",
  ).first<{ n: number }>();
  if ((row?.n ?? 0) >= GLOBAL_INDICES.length) return;
  const insert = env.DB.prepare(
    `insert into securities (market, symbol, name, industry, kind, updated_at)
     values (?, ?, ?, '指數', 'index', ?)
     on conflict(market, symbol) do update set name = excluded.name, updated_at = excluded.updated_at`,
  );
  await env.DB.batch(GLOBAL_INDICES.map((x) => insert.bind(x.market, x.symbol, x.name, Date.now())));
}

export async function searchSecurities(env: Env, q: string, limit = 20): Promise<Security[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const like = `%${trimmed}%`;
  const { results } = await env.DB.prepare(
    `select market, symbol, name, kind from securities
     where symbol like ? or name like ?
     order by
       case when symbol = ? then 0 else 1 end,
       case when kind = 'index' then 0 else 1 end,
       symbol
     limit ?`,
  )
    .bind(like, like, trimmed, limit)
    .all<Security>();
  return results;
}
