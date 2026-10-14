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
    const message: string = body?.error ?? "";
    if (res.status === 402 || message.includes("402") || /upper limit/i.test(message)) {
      throw new Error("資料來源額度暫時用滿，請稍後再試（設定免費 FinMind token 可提高額度）");
    }
    throw new Error(message || `讀取資料失敗 (${res.status})`);
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

export interface Note {
  date: string;
  title: string;
  body: string | null;
  tags: string[];
  mood: string | null;
  updatedAt?: number;
}

export interface CalendarNote {
  date: string;
  market: string;
  symbol: string;
  title: string;
  mood: string | null;
}

export interface NoteInput {
  market: string;
  symbol: string;
  date: string;
  title: string;
  body: string;
  tags: string[];
  mood: string;
}

export async function fetchNotes(
  market: string,
  symbol: string,
  from: string,
  to: string,
): Promise<Note[]> {
  const params = new URLSearchParams({ market, symbol, from, to });
  const res = await fetch(`/api/notes?${params.toString()}`, { credentials: "same-origin" });
  const data = await json<{ notes: Note[] }>(res);
  return data?.notes ?? [];
}

export async function saveNote(input: NoteInput): Promise<void> {
  await fetch(`/api/notes/${encodeURIComponent(input.date)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getNote(
  market: string,
  symbol: string,
  date: string,
): Promise<Note | null> {
  const params = new URLSearchParams({ market, symbol });
  const res = await fetch(`/api/notes/${encodeURIComponent(date)}?${params.toString()}`, {
    credentials: "same-origin",
  });
  const data = await json<{ note: Note | null }>(res);
  return data?.note ?? null;
}

export async function fetchCalendar(month: string): Promise<CalendarNote[]> {
  const res = await fetch(`/api/notes/calendar?month=${encodeURIComponent(month)}`, {
    credentials: "same-origin",
  });
  const data = await json<{ notes: CalendarNote[] }>(res);
  return data?.notes ?? [];
}

export interface NoteSearchResult {
  date: string;
  market: string;
  symbol: string;
  name: string;
  title: string;
  mood: string | null;
}

export async function searchNotes(q: string): Promise<NoteSearchResult[]> {
  const res = await fetch(`/api/notes/search?q=${encodeURIComponent(q)}`, {
    credentials: "same-origin",
  });
  const data = await json<{ notes: NoteSearchResult[] }>(res);
  return data?.notes ?? [];
}

export interface RecentNote extends NoteSearchResult {
  excerpt: string | null;
}

export async function fetchRecentNotes(only?: {
  market: string;
  symbol: string;
}): Promise<RecentNote[]> {
  const params = new URLSearchParams({ limit: "50" });
  if (only) {
    params.set("market", only.market);
    params.set("symbol", only.symbol);
  }
  const res = await fetch(`/api/notes/recent?${params.toString()}`, {
    credentials: "same-origin",
  });
  const data = await json<{ notes: RecentNote[] }>(res);
  return data?.notes ?? [];
}

export interface ExportedNote {
  date: string;
  market: string;
  symbol: string;
  name: string;
  title: string;
  body: string | null;
  tags: string[];
  mood: string | null;
  updatedAt: number;
}

export async function exportNotes(): Promise<ExportedNote[]> {
  const res = await fetch("/api/notes/export", { credentials: "same-origin" });
  const data = await json<{ notes: ExportedNote[] }>(res);
  return data?.notes ?? [];
}

export interface MarketData {
  from: string;
  to: string;
  institutional: Array<{ date: string; foreign: number; trust: number; dealer: number; total: number }>;
  margin: Array<{ date: string; balance: number; shortBalance: number }>;
  maintenance: Array<{ date: string; value: number }>;
  taiex: Array<{ date: string; close: number }>;
}

export async function fetchMarket(days = 400): Promise<MarketData> {
  const res = await fetch(`/api/market?days=${days}`, { credentials: "same-origin" });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error ?? `讀取市場數據失敗 (${res.status})`);
  return body as MarketData;
}

export type TradeSide = "long" | "short";
export type TradeStatus = "plan" | "open" | "closed" | "cancelled";

export interface Trade {
  id: string;
  market: string;
  symbol: string;
  name: string;
  side: TradeSide;
  status: TradeStatus;
  strategy: string | null;
  reason: string | null;
  plan_date: string;
  entry_date: string | null;
  entry_price: number;
  shares: number;
  stop_price: number;
  target_price: number | null;
  exit_date: string | null;
  exit_price: number | null;
  exit_note: string | null;
  followed_plan: number | null;
  last: { date: string; close: number } | null;
  alert: "stop" | "target" | null;
}

export type TradeInput = Partial<Omit<Trade, "id" | "name" | "last" | "alert" | "followed_plan">> & {
  followed_plan?: boolean | null;
};

export async function fetchTrades(): Promise<Trade[]> {
  const res = await fetch("/api/trades", { credentials: "same-origin" });
  const data = await json<{ trades: Trade[] }>(res);
  return data?.trades ?? [];
}

async function send(method: string, url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new Error(b?.error ?? `儲存失敗 (${res.status})`);
  }
}

export const createTrade = (input: TradeInput) => send("POST", "/api/trades", input);
export const updateTrade = (id: string, input: TradeInput) =>
  send("PATCH", `/api/trades/${encodeURIComponent(id)}`, input);
export const deleteTrade = (id: string) => send("DELETE", `/api/trades/${encodeURIComponent(id)}`);
