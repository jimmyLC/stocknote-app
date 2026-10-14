import type { Env } from "./types";

// 市場數據（籌碼面）。每種數據一個 fetcher，回傳 {date, ...數值}；之後要加新數據就在這裡加一個。
// 上游的欄位名稱（FinMind 的 Foreign_Investor、TWSE 的民國日期等）只在這個檔案裡出現。

const FINMIND = "https://api.finmindtrade.com/api/v4/data";

async function finmind<T>(env: Env, dataset: string, from: string, to: string): Promise<T[]> {
  const params = new URLSearchParams({ dataset, start_date: from, end_date: to });
  if (env.FINMIND_TOKEN) params.set("token", env.FINMIND_TOKEN);
  const res = await fetch(`${FINMIND}?${params.toString()}`);
  if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`);
  const json = (await res.json()) as { status: number; msg: string; data: T[] };
  if (json.status !== 200) throw new Error(`FinMind ${json.status}: ${json.msg}`);
  return json.data;
}

export interface InstitutionalDay {
  date: string;
  /** 買賣超（元），正＝買超 */
  foreign: number;
  trust: number;
  dealer: number;
  total: number;
}

/** 三大法人現貨買賣超金額（上市，同證交所 BFI82U）。 */
export async function getInstitutional(env: Env, from: string, to: string): Promise<InstitutionalDay[]> {
  const rows = await finmind<{ date: string; name: string; buy: number; sell: number }>(
    env,
    "TaiwanStockTotalInstitutionalInvestors",
    from,
    to,
  );
  const byDate = new Map<string, InstitutionalDay>();
  for (const r of rows) {
    let d = byDate.get(r.date);
    if (!d) {
      d = { date: r.date, foreign: 0, trust: 0, dealer: 0, total: 0 };
      byDate.set(r.date, d);
    }
    const net = r.buy - r.sell;
    // 外資＝外資及陸資（不含外資自營商）＋外資自營商；自營商＝自行買賣＋避險
    if (r.name === "Foreign_Investor" || r.name === "Foreign_Dealer_Self") d.foreign += net;
    else if (r.name === "Investment_Trust") d.trust += net;
    else if (r.name === "Dealer_self" || r.name === "Dealer_Hedging") d.dealer += net;
    else if (r.name === "total") d.total = net;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface MarginDay {
  date: string;
  /** 融資餘額（元） */
  balance: number;
  /** 融券餘額（張） */
  shortBalance: number;
}

/** 整體市場融資餘額（金額）＋融券餘額。 */
export async function getMargin(env: Env, from: string, to: string): Promise<MarginDay[]> {
  const rows = await finmind<{ date: string; name: string; TodayBalance: number }>(
    env,
    "TaiwanStockTotalMarginPurchaseShortSale",
    from,
    to,
  );
  const byDate = new Map<string, MarginDay>();
  for (const r of rows) {
    let d = byDate.get(r.date);
    if (!d) {
      d = { date: r.date, balance: 0, shortBalance: 0 };
      byDate.set(r.date, d);
    }
    if (r.name === "MarginPurchaseMoney") d.balance = r.TodayBalance;
    else if (r.name === "ShortSale") d.shortBalance = r.TodayBalance;
  }
  return [...byDate.values()].filter((d) => d.balance > 0).sort((a, b) => a.date.localeCompare(b.date));
}

// ── 融資維持率（估算） ───────────────────────────────────────────
// 證交所 2026/07/29 起不再公布，大盤維持率本來就是「整戶計算」，外界數字都是估算。
// 估算法：Σ(各股融資餘額張數 × 1000 × 當日收盤價) ÷ 融資金額。
// 資料全部來自證交所官網（MI_MARGN 融資融券彙總、MI_INDEX 每日收盤行情），一天 2 個請求。
// 2026-10-14 驗算：191.61%，與 Blave 公布的 191.62% 相符。

const MAINT = "maintenance";
const num = (s: string) => {
  const v = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
};

interface TwseTable {
  title?: string;
  fields?: string[];
  data?: string[][];
}

async function twse(path: string, date: string, extra: string): Promise<TwseTable[] | null> {
  const res = await fetch(
    `https://www.twse.com.tw/rwd/zh/${path}?date=${date.replace(/-/g, "")}&${extra}&response=json`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; StockNote/1.0)" } },
  );
  if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
  const json = (await res.json()) as { stat: string; tables?: TwseTable[] };
  return json.stat === "OK" && json.tables ? json.tables : null;
}

/** 算出某一天的維持率（%）；休市回傳 null。 */
export async function computeMaintenance(date: string): Promise<number | null> {
  const margin = await twse("marginTrading/MI_MARGN", date, "selectType=ALL");
  if (!margin) return null;
  const summary = margin[0]?.data?.find((r) => r[0].startsWith("融資金額"));
  const loan = summary ? num(summary[5]) : null; // 今日餘額（仟元）
  const detail = margin.find((t) => t.title?.includes("融資融券彙總"))?.data;
  if (!loan || !detail) return null;

  const quotes = await twse("afterTrading/MI_INDEX", date, "type=ALLBUT0999");
  const daily = quotes?.find((t) => t.title?.includes("每日收盤行情"));
  if (!daily?.data || !daily.fields) return null;
  const closeIdx = daily.fields.indexOf("收盤價");
  const price = new Map<string, number>();
  for (const r of daily.data) {
    const c = num(r[closeIdx]);
    if (c) price.set(r[0], c);
  }

  let marketValue = 0;
  for (const r of detail) {
    const lots = num(r[6]) ?? 0; // 融資今日餘額（張）
    const p = price.get(r[0]);
    if (lots && p) marketValue += lots * 1000 * p;
  }
  return Math.round((marketValue / (loan * 1000)) * 10000) / 100;
}

function isoDaysAgo(days: number, from = new Date()): string {
  const d = new Date(from.getTime() - days * 864e5);
  return d.toISOString().slice(0, 10);
}

/** 台北時間的今天（YYYY-MM-DD）。 */
export function taipeiToday(): string {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}

export async function getMaintenance(env: Env, from: string, to: string) {
  const { results } = await env.DB.prepare(
    `select date, value from market_series
     where series = ? and date between ? and ? and value is not null
     order by date`,
  )
    .bind(MAINT, from, to)
    .all<{ date: string; value: number }>();
  return results;
}

/**
 * 補資料：從今天往回，找出還沒算過的平日，最多算 limit 天。
 * TWSE 會擋太密集的請求，所以每天之間停一下；由排程（cron）慢慢把一年份補齊。
 */
export async function backfillMaintenance(env: Env, limit: number, days = 400): Promise<number> {
  const today = taipeiToday();
  const { results } = await env.DB.prepare(
    "select date from market_series where series = ? and date >= ?",
  )
    .bind(MAINT, isoDaysAgo(days, new Date(`${today}T00:00:00Z`)))
    .all<{ date: string }>();
  const done = new Set(results.map((r) => r.date));
  // 今天 21:00 前證交所的融資資料還沒出來，不要把「今天」記成休市。
  const taipeiHour = new Date(Date.now() + 8 * 3600e3).getUTCHours();

  let count = 0;
  for (let i = 0; i < days && count < limit; i++) {
    const date = isoDaysAgo(i, new Date(`${today}T00:00:00Z`));
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6 || done.has(date)) continue;
    if (date === today && taipeiHour < 22) continue;
    const value = await computeMaintenance(date);
    await env.DB.prepare(
      `insert into market_series (series, date, value, updated_at) values (?, ?, ?, ?)
       on conflict(series, date) do update set value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind(MAINT, date, value, Date.now())
      .run();
    count++;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return count;
}
