import { finmind } from "./providers/finmind";
import { finmindUs, naver, nikkei, yahoo } from "./providers/global";
import { twse } from "./providers/twse";
import type { Bar, MarketDataProvider, Security } from "./providers/types";

// 依序嘗試，第一個有資料的就用：
//   台股：FinMind → TWSE 官網
//   美股指數：FinMind → Yahoo
//   韓股 KOSPI：Naver → Yahoo
//   日經 225：Yahoo → 日經官網（近 3 年）
const providers: MarketDataProvider[] = [finmind, twse, finmindUs, naver, yahoo, nikkei];

export interface OhlcvResult {
  provider: string;
  bars: Bar[];
}

export async function getDailyOHLCV(
  security: Security,
  from: string,
  to: string,
  opts?: { token?: string },
): Promise<OhlcvResult> {
  let lastError: unknown;
  for (const provider of providers) {
    if (!provider.supports(security)) continue;
    try {
      const bars = await provider.getDailyOHLCV(security, from, to, opts);
      if (bars.length > 0) return { provider: provider.id, bars };
      lastError = new Error(`${provider.id} 沒有資料`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("所有資料來源都失敗");
}
