export const MA_PERIODS = [5, 10, 20, 60, 120, 240] as const;

export const MA_COLORS: Record<number, string> = {
  5: "#4286F5",
  10: "#FEBD09",
  20: "#E65596",
  60: "#83BF0A",
  120: "#834BEB",
  240: "#FC7742",
};

/** 區間快捷：[標籤, 顯示根數]（null = 全部） */
export const RANGES: Array<[string, number | null]> = [
  ["3M", 63],
  ["6M", 126],
  ["1Y", 250],
  ["3Y", 750],
  ["全部", null],
];

export type Period = "day" | "week" | "month";

export interface Prefs {
  /** key 為均線週期的字串，例如 "5" */
  ma: Record<string, boolean>;
  vol: boolean;
  macd: boolean;
  kdj: boolean;
  /** 預設顯示根數；null = 全部 */
  range: number | null;
  /** 週期：日 / 週 / 月 */
  period: Period;
}

export const PERIODS: Array<[string, Period]> = [
  ["日", "day"],
  ["週", "week"],
  ["月", "month"],
];

export const DEFAULT_PREFS: Prefs = {
  ma: Object.fromEntries(MA_PERIODS.map((p) => [String(p), true])),
  vol: true,
  macd: true,
  kdj: true,
  range: 250,
  period: "day",
};

const LS_KEY = "stocknote.prefs";

function merge(prefs: unknown): Prefs {
  if (!prefs || typeof prefs !== "object") return { ...DEFAULT_PREFS };
  const p = prefs as Partial<Prefs>;
  const period: Period = p.period === "week" || p.period === "month" ? p.period : "day";
  return {
    ...DEFAULT_PREFS,
    ...p,
    ma: { ...DEFAULT_PREFS.ma, ...(p.ma ?? {}) },
    period,
  };
}

export function loadLocalPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? merge(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveLocalPrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略（例如無痕模式）
  }
}

export async function fetchPrefs(): Promise<Prefs | null> {
  const res = await fetch("/api/prefs", { credentials: "same-origin" });
  if (!res.ok) return null;
  const { prefs } = (await res.json()) as { prefs: unknown };
  return prefs ? merge(prefs) : null;
}

export async function putPrefs(prefs: Prefs): Promise<void> {
  await fetch("/api/prefs", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefs }),
  });
}
