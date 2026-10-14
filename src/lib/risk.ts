import type { Trade, TradeSide } from "./api";

// 風控計算（純函式）：每股風險、風險報酬比、建議股數、R 倍數、損益、統計。

export const MIN_RR = 2;

const dir = (side: TradeSide) => (side === "long" ? 1 : -1);

export interface PlanCheck {
  riskPerShare: number;
  rr: number | null;
  /** 這筆最多會賠多少（元） */
  riskAmount: number;
  /** 佔總資金 % */
  riskPctOfCapital: number;
  /** 依「每筆最多賠 riskPct%」算出的建議股數（取整張；不足一張給零股） */
  suggestedShares: number;
  errors: string[];
  warnings: string[];
}

export function checkPlan(p: {
  side: TradeSide;
  entry: number;
  stop: number;
  target: number | null;
  shares: number;
  capital: number;
  riskPct: number;
}): PlanCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const d = dir(p.side);
  const riskPerShare = (p.entry - p.stop) * d;
  if (p.entry > 0 && p.stop > 0 && riskPerShare <= 0) {
    errors.push(p.side === "long" ? "做多的停損價要低於進場價" : "做空的停損價要高於進場價");
  }
  if (p.target && p.entry > 0 && (p.target - p.entry) * d <= 0) {
    errors.push(p.side === "long" ? "做多的停利價要高於進場價" : "做空的停利價要低於進場價");
  }
  const rr = p.target && riskPerShare > 0 ? ((p.target - p.entry) * d) / riskPerShare : null;
  if (rr !== null && rr > 0 && rr < MIN_RR) {
    warnings.push(`風險報酬比 1 : ${rr.toFixed(2)}，低於 1 : ${MIN_RR}，這筆不太划算`);
  }
  if (!p.target) warnings.push("沒有設停利價：至少想好要在哪裡分批出場");

  const riskAmount = Math.max(0, riskPerShare) * p.shares;
  const riskPctOfCapital = p.capital > 0 ? (riskAmount / p.capital) * 100 : 0;
  const budget = (p.capital * p.riskPct) / 100;
  let suggestedShares = 0;
  if (riskPerShare > 0) {
    const raw = Math.floor(budget / riskPerShare);
    suggestedShares = raw >= 1000 ? Math.floor(raw / 1000) * 1000 : raw;
  }
  if (riskPctOfCapital > p.riskPct * 1.001 && p.shares > 0) {
    warnings.push(
      `這筆最多會賠總資金的 ${riskPctOfCapital.toFixed(2)}%，超過你設定的 ${p.riskPct}%`,
    );
  }
  return { riskPerShare, rr, riskAmount, riskPctOfCapital, suggestedShares, errors, warnings };
}

/** 實際出場（或用最新收盤估）的 R 倍數與損益。 */
export function result(t: Trade, price: number | null) {
  if (price == null) return null;
  const d = dir(t.side);
  const riskPerShare = (t.entry_price - t.stop_price) * d;
  const pnl = (price - t.entry_price) * d * t.shares;
  const r = riskPerShare > 0 ? ((price - t.entry_price) * d) / riskPerShare : null;
  return { pnl, r, pct: ((price - t.entry_price) / t.entry_price) * 100 * d };
}

export function stats(trades: Trade[]) {
  const closed = trades.filter((t) => t.status === "closed" && t.exit_price != null);
  const results = closed.map((t) => result(t, t.exit_price)!);
  const wins = results.filter((r) => r.pnl > 0).length;
  const rs = results.map((r) => r.r).filter((r): r is number => r != null);
  const graded = closed.filter((t) => t.followed_plan != null);
  const followed = graded.filter((t) => t.followed_plan === 1).length;
  return {
    open: trades.filter((t) => t.status === "open").length,
    plan: trades.filter((t) => t.status === "plan").length,
    closed: closed.length,
    winRate: closed.length ? (wins / closed.length) * 100 : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    pnl: results.reduce((a, r) => a + r.pnl, 0),
    discipline: graded.length ? (followed / graded.length) * 100 : null,
  };
}
