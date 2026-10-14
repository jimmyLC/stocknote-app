// 側邊欄「全球大盤」快捷清單（後端 worker/indices.ts 也有同一份代號）。
export const MARKET_LABEL: Record<string, string> = { TW: "台", US: "美", JP: "日", KR: "韓" };

export const GLOBAL_INDICES = [
  { market: "TW", symbol: "0000", name: "加權指數" },
  { market: "US", symbol: "SPX", name: "S&P 500" },
  { market: "US", symbol: "IXIC", name: "那斯達克" },
  { market: "US", symbol: "SOX", name: "費城半導體" },
  { market: "US", symbol: "DJI", name: "道瓊工業" },
  { market: "JP", symbol: "N225", name: "日經 225" },
  { market: "KR", symbol: "KOSPI", name: "韓國 KOSPI" },
];

/** 台股個股才有「成交金額（新台幣）」與「未還原」的問題；指數與國外都沒有。 */
export function isTwStock(market: string, symbol: string) {
  return market === "TW" && symbol !== "0000";
}
