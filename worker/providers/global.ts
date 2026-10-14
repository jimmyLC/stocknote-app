import { findIndex } from "../indices";
import type { Bar, MarketDataProvider } from "./types";

// 國際大盤的資料來源。外國指數沒有「成交金額」，turnover 先放成交量（畫面會改標「成交量」）。

const UA = { "User-Agent": "Mozilla/5.0 (compatible; StockNote/1.0)" };

/** FinMind USStockPrice：美股四大指數（免費、實測有資料）。 */
export const finmindUs: MarketDataProvider = {
  id: "finmind",
  supports: (s) => !!findIndex(s.market, s.symbol)?.finmind,
  async getDailyOHLCV(security, from, to, opts) {
    const params = new URLSearchParams({
      dataset: "USStockPrice",
      data_id: findIndex(security.market, security.symbol)!.finmind!,
      start_date: from,
      end_date: to,
    });
    if (opts?.token) params.set("token", opts.token);
    const res = await fetch(`https://api.finmindtrade.com/api/v4/data?${params.toString()}`);
    if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`);
    const json = (await res.json()) as {
      status: number;
      msg: string;
      data: Array<{ date: string; Open: number; High: number; Low: number; Close: number; Volume: number }>;
    };
    if (json.status !== 200) throw new Error(`FinMind ${json.status}: ${json.msg}`);
    return json.data.map((r) => ({
      date: r.date,
      open: r.Open,
      high: r.High,
      low: r.Low,
      close: r.Close,
      volume: r.Volume,
      turnover: r.Volume,
    }));
  },
};

/**
 * Naver Finance siseJson：韓國 KOSPI。
 * 韓國的開源套件（FinanceDataReader、pykrx）也是抓 Naver。
 * 回傳是「像 JSON 但用單引號」的陣列，所以逐行解析資料列。
 */
export const naver: MarketDataProvider = {
  id: "naver",
  supports: (s) => !!findIndex(s.market, s.symbol)?.naver,
  async getDailyOHLCV(security, from, to) {
    const params = new URLSearchParams({
      symbol: findIndex(security.market, security.symbol)!.naver!,
      requestType: "1",
      startTime: from.replace(/-/g, ""),
      endTime: to.replace(/-/g, ""),
      timeframe: "day",
    });
    const res = await fetch(`https://api.finance.naver.com/siseJson.naver?${params.toString()}`, {
      headers: UA,
    });
    if (!res.ok) throw new Error(`Naver HTTP ${res.status}`);
    const text = await res.text();
    const bars: Bar[] = [];
    for (const m of text.matchAll(/\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/g)) {
      const [, d, open, high, low, close, volume] = m;
      bars.push({
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
        turnover: Number(volume),
      });
    }
    return bars;
  },
};

/**
 * Yahoo Finance chart API（非官方，但 yfinance、FinanceDataReader 都用它）。
 * 日經 225 的主來源；也是其他國際指數的備援。
 */
export const yahoo: MarketDataProvider = {
  id: "yahoo",
  supports: (s) => !!findIndex(s.market, s.symbol),
  async getDailyOHLCV(security, from, to) {
    const ticker = findIndex(security.market, security.symbol)!.yahoo;
    const p1 = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000);
    const p2 = Math.floor(Date.parse(`${to}T23:59:59Z`) / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const json = (await res.json()) as {
      chart: {
        result?: Array<{
          meta: { gmtoffset: number };
          timestamp?: number[];
          indicators: {
            quote: Array<{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }>;
          };
        }>;
      };
    };
    const r = json.chart.result?.[0];
    if (!r?.timestamp) return [];
    const q = r.indicators.quote[0];
    const bars: Bar[] = [];
    r.timestamp.forEach((ts, i) => {
      const [open, high, low, close] = [q.open[i], q.high[i], q.low[i], q.close[i]];
      if (open == null || high == null || low == null || close == null) return;
      bars.push({
        // 用交易所當地時區換算日期
        date: new Date((ts + r.meta.gmtoffset) * 1000).toISOString().slice(0, 10),
        open,
        high,
        low,
        close,
        volume: q.volume[i] ?? 0,
        turnover: q.volume[i] ?? 0,
      });
    });
    return bars;
  },
};

/** 日經官網 CSV（官方、免費，但只有近 3 年、沒有成交量）。日經 225 的備援。 */
export const nikkei: MarketDataProvider = {
  id: "nikkei",
  supports: (s) => s.market === "JP" && s.symbol === "N225",
  async getDailyOHLCV(_security, from, to) {
    const res = await fetch(
      "https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_jp.csv",
      { headers: UA },
    );
    if (!res.ok) throw new Error(`Nikkei HTTP ${res.status}`);
    // 檔案是 Shift_JIS；我們只需要數字與日期，表頭亂碼不影響。
    const text = new TextDecoder("shift_jis").decode(await res.arrayBuffer());
    const bars: Bar[] = [];
    for (const m of text.matchAll(/"(\d{4})\/(\d{2})\/(\d{2})","([\d.]+)","([\d.]+)","([\d.]+)","([\d.]+)"/g)) {
      const [, y, mo, d, close, open, high, low] = m;
      const date = `${y}-${mo}-${d}`;
      if (date < from || date > to) continue;
      bars.push({ date, open: +open, high: +high, low: +low, close: +close, volume: 0, turnover: 0 });
    }
    return bars;
  },
};
