import type { Bar, MarketDataProvider, Security } from "./types";

const BASE = "https://api.finmindtrade.com/api/v4/data";

// 我們的代號 -> FinMind 的 data_id。加權指數 = "0000"，FinMind 叫 "TAIEX"。
function providerId(security: Security): string {
  if (security.market === "TW" && security.symbol === "0000") return "TAIEX";
  return security.symbol;
}

interface FinMindRow {
  date: string;
  max: number;
  min: number;
  open: number;
  close: number;
  Trading_Volume: number;
  Trading_money: number;
}

/**
 * FinMind（主來源）。
 * TW: TaiwanStockPrice（1994 起，含成交量）。
 * US: 之後改用 USStockPrice（欄位不同，V2/V3 再處理）。
 */
export const finmind: MarketDataProvider = {
  id: "finmind",
  supports: (security) => security.market === "TW",
  async getDailyOHLCV(security, from, to, opts) {
    const params = new URLSearchParams({
      dataset: "TaiwanStockPrice",
      data_id: providerId(security),
      start_date: from,
      end_date: to,
    });
    if (opts?.token) params.set("token", opts.token);

    const res = await fetch(`${BASE}?${params.toString()}`);
    if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`);
    const json = (await res.json()) as { status: number; msg: string; data: FinMindRow[] };
    if (json.status !== 200) throw new Error(`FinMind ${json.status}: ${json.msg}`);

    return json.data.map(
      (r): Bar => ({
        date: r.date,
        open: r.open,
        high: r.max, // FinMind 的高點叫 max
        low: r.min, // 低點叫 min
        close: r.close,
        volume: r.Trading_Volume,
        turnover: r.Trading_money,
      }),
    );
  },
};
