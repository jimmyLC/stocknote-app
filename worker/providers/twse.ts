import type { Bar, MarketDataProvider } from "./types";

// TWSE 官網備援（只涵蓋台股）。加權指數要合併兩份報表：
//   MI_5MINS_HIST → 每日 OHLC（無量）
//   FMTQIK        → 每日成交股數/成交金額（無 OHLC）
// 注意：openapi.twse.com.tw 沒有 CORS、也沒有歷史，所以走 www.twse.com.tw。

const MI_HIST = "https://www.twse.com.tw/indicesReport/MI_5MINS_HIST";
const FMTQIK = "https://www.twse.com.tw/exchangeReport/FMTQIK";

function rocToIso(s: string): string {
  const [y, m, d] = s.split("/");
  return `${Number(y) + 1911}-${m}-${d}`;
}

const num = (s: string | number) => Number(String(s).replace(/,/g, ""));

function monthsBetween(from: string, to: string): Array<[number, number]> {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: Array<[number, number]> = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push([y, m]);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

async function fetchMonth(path: string, year: number, month: number): Promise<string[][]> {
  const date = `${year}${String(month).padStart(2, "0")}01`;
  const res = await fetch(`${path}?response=json&date=${date}`);
  if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
  const json = (await res.json()) as { stat: string; data?: string[][] };
  if (json.stat !== "OK" || !json.data) return [];
  return json.data;
}

export const twse: MarketDataProvider = {
  id: "twse",
  // 目前只支援加權指數；台股個股之後再擴充（STOCK_DAY）。
  supports: (security) => security.market === "TW" && security.symbol === "0000",
  async getDailyOHLCV(_security, from, to) {
    const ohlc = new Map<string, { open: number; high: number; low: number; close: number }>();
    const volume = new Map<string, number>();
    const turnover = new Map<string, number>();

    for (const [y, m] of monthsBetween(from, to)) {
      const [hist, fmt] = await Promise.all([
        fetchMonth(MI_HIST, y, m),
        fetchMonth(FMTQIK, y, m),
      ]);
      for (const row of hist) {
        ohlc.set(rocToIso(row[0]), {
          open: num(row[1]),
          high: num(row[2]),
          low: num(row[3]),
          close: num(row[4]),
        });
      }
      for (const row of fmt) {
        const d = rocToIso(row[0]);
        volume.set(d, num(row[1]));
        turnover.set(d, num(row[2]));
      }
    }

    return [...ohlc.keys()].sort().map(
      (date): Bar => ({
        date,
        ...ohlc.get(date)!,
        volume: volume.get(date) ?? 0,
        turnover: turnover.get(date) ?? 0,
      }),
    );
  },
};
