import { finmind } from "./providers/finmind";
import { twse } from "./providers/twse";
import type { Bar, MarketDataProvider, Security } from "./providers/types";

// FinMind 主、TWSE 官網備援。
const providers: MarketDataProvider[] = [finmind, twse];

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
