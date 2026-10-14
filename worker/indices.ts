// 國際大盤指數主檔：我們的代號 → 各資料來源的代號。
// 只有 adapter（providers/*）會用到這些上游代號。

export interface GlobalIndex {
  market: "US" | "JP" | "KR";
  symbol: string;
  name: string;
  /** FinMind USStockPrice 的 data_id */
  finmind?: string;
  /** Yahoo Finance chart API 的代號 */
  yahoo: string;
  /** Naver siseJson 的 symbol */
  naver?: string;
}

export const GLOBAL_INDICES: GlobalIndex[] = [
  { market: "US", symbol: "SPX", name: "S&P 500", finmind: "^GSPC", yahoo: "^GSPC" },
  { market: "US", symbol: "IXIC", name: "那斯達克綜合指數", finmind: "^IXIC", yahoo: "^IXIC" },
  { market: "US", symbol: "DJI", name: "道瓊工業指數", finmind: "^DJI", yahoo: "^DJI" },
  { market: "US", symbol: "SOX", name: "費城半導體指數", finmind: "^SOX", yahoo: "^SOX" },
  { market: "JP", symbol: "N225", name: "日經 225", yahoo: "^N225" },
  { market: "KR", symbol: "KOSPI", name: "韓國綜合指數 KOSPI", yahoo: "^KS11", naver: "KOSPI" },
];

export function findIndex(market: string, symbol: string): GlobalIndex | undefined {
  return GLOBAL_INDICES.find((x) => x.market === market && x.symbol === symbol);
}
