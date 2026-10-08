export interface Bar {
  /** YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 成交股數 (shares) */
  volume: number;
  /** 成交金額 (NTD) */
  turnover: number;
}

export interface OhlcvResponse {
  market: string;
  symbol: string;
  from: string;
  to: string;
  provider: string;
  cached: boolean;
  bars: Bar[];
}

export async function fetchOhlcv(
  market: string,
  symbol: string,
  opts?: { from?: string; to?: string },
): Promise<OhlcvResponse> {
  const params = new URLSearchParams({ market, symbol });
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  const res = await fetch(`/api/ohlcv?${params.toString()}`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `讀取資料失敗 (${res.status})`);
  }
  return (await res.json()) as OhlcvResponse;
}
