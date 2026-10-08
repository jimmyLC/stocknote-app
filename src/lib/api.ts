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

export interface Security {
  market: string;
  symbol: string;
  name: string;
  kind: string;
}

export interface Favorite {
  id: string;
  market: string;
  symbol: string;
  name: string;
  kind: string;
  sortOrder: number;
}

async function json<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  return (await res.json()) as T;
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

export async function searchSecurities(q: string): Promise<Security[]> {
  const res = await fetch(`/api/securities?q=${encodeURIComponent(q)}`, {
    credentials: "same-origin",
  });
  const data = await json<{ results: Security[] }>(res);
  return data?.results ?? [];
}

export async function getFavorites(): Promise<Favorite[]> {
  const res = await fetch("/api/favorites", { credentials: "same-origin" });
  const data = await json<{ favorites: Favorite[] }>(res);
  return data?.favorites ?? [];
}

export async function addFavorite(market: string, symbol: string): Promise<void> {
  await fetch("/api/favorites", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ market, symbol }),
  });
}

export async function removeFavorite(id: string): Promise<void> {
  await fetch(`/api/favorites/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
}

export async function orderFavorites(ids: string[]): Promise<void> {
  await fetch("/api/favorites/order", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}
