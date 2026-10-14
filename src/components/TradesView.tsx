import { useCallback, useEffect, useState } from "react";
import {
  createTrade,
  deleteTrade,
  fetchTrades,
  updateTrade,
  type Trade,
  type TradeStatus,
} from "../lib/api";
import { result, stats } from "../lib/risk";
import { PlanForm, StepForm } from "./TradeForm";
import Icon from "./Icon";
import { isTwStock } from "../lib/markets";

interface Props {
  security: { market: string; symbol: string; name: string };
  lastClose: number | null;
  capital: number;
  riskPct: number;
  onSettings: (patch: { capital?: number; riskPct?: number }) => void;
  onOpenChart: (s: { market: string; symbol: string; name: string }) => void;
  /** 交易變動後通知外層（圖上的停損／停利線要更新） */
  onChanged: () => void;
}

const SECTIONS: Array<[TradeStatus, string]> = [
  ["open", "持有中"],
  ["plan", "計畫中"],
  ["closed", "已出場"],
  ["cancelled", "已取消"],
];

const num = (v: number, d = 2) => v.toLocaleString(undefined, { maximumFractionDigits: d });
const signed = (v: number, d = 0) => `${v > 0 ? "+" : ""}${num(v, d)}`;
const tone = (v: number) => (v > 0 ? "up" : v < 0 ? "down" : "");

export default function TradesView({
  security,
  lastClose,
  capital,
  riskPct,
  onSettings,
  onOpenChart,
  onChanged,
}: Props) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [editing, setEditing] = useState<Trade | "new" | null>(null);
  const [step, setStep] = useState<{ trade: Trade; mode: "enter" | "exit" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setTrades(await fetchTrades());
    onChanged();
  }, [onChanged]);

  useEffect(() => {
    fetchTrades().then(setTrades);
  }, []);

  if (!trades) return <div className="trades"><div className="placeholder muted">載入交易紀錄…</div></div>;

  const s = stats(trades);
  const alerts = trades.filter((t) => t.alert);

  async function act(id: string, input: Parameters<typeof updateTrade>[1]) {
    await updateTrade(id, input);
    await reload();
  }

  return (
    <div className="trades">
      <div className="market-bar">
        <span className="section-title">交易計畫</span>
        <span className="muted small">進場前先寫好停損／停利，出場後誠實檢討</span>
        <span className="grow" />
        <button className="primary" onClick={() => setEditing("new")}>
          <Icon name="plus" size={16} />
          新交易計畫
        </button>
      </div>

      <div className="settings-row">
        <label className="inline-field">
          總資金
          <input
            type="number"
            min={0}
            step={10000}
            defaultValue={capital}
            onBlur={(e) => Number(e.target.value) > 0 && onSettings({ capital: Number(e.target.value) })}
          />
          元
        </label>
        <label className="inline-field">
          每筆最多賠
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.5}
            defaultValue={riskPct}
            onBlur={(e) => Number(e.target.value) > 0 && onSettings({ riskPct: Number(e.target.value) })}
          />
          %
        </label>
        <span className="muted small">＝每筆停損上限 {num((capital * riskPct) / 100, 0)} 元。一般建議 1–2%。</span>
      </div>

      {alerts.length > 0 && (
        <div className="alert-list">
          {alerts.map((t) => (
            <div key={t.id} className={`alert-item ${t.alert}`}>
              <strong>
                {t.alert === "stop" ? "觸及停損" : "到達停利"}・{t.name}
              </strong>
              <span>
                {t.last?.date} 收盤 {num(t.last!.close)}，
                {t.alert === "stop" ? `停損價 ${num(t.stop_price)}。依計畫出場，不要凹單。` : `停利價 ${num(t.target_price!)}，可以分批獲利了結。`}
              </span>
              <span className="grow" />
              <button onClick={() => setStep({ trade: t, mode: "exit" })}>記錄出場</button>
            </div>
          ))}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">持有中／計畫中</div>
          <div className="stat-value">
            {s.open}／{s.plan}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">勝率（{s.closed} 筆）</div>
          <div className="stat-value">{s.winRate == null ? "—" : `${s.winRate.toFixed(0)}%`}</div>
        </div>
        <div className="stat">
          <div className="stat-label">平均 R（賺賠是風險的幾倍）</div>
          <div className={`stat-value ${s.avgR == null ? "" : tone(s.avgR)}`}>
            {s.avgR == null ? "—" : `${signed(s.avgR, 2)}R`}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">守紀律率</div>
          <div className={`stat-value ${s.discipline != null && s.discipline < 80 ? "warn-text" : ""}`}>
            {s.discipline == null ? "—" : `${s.discipline.toFixed(0)}%`}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">已實現損益</div>
          <div className={`stat-value ${tone(s.pnl)}`}>{signed(s.pnl)} 元</div>
        </div>
      </div>

      {trades.length === 0 && (
        <div className="empty-card">
          <p>還沒有任何交易計畫。</p>
          <p className="muted small">
            建議流程：盤後看圖 → 寫計畫（進場、停損、停利、張數）→ 盤中照計畫下單，並在券商設好停損觸價單 → 每天收盤後回來看提醒。
          </p>
        </div>
      )}

      {SECTIONS.map(([status, label]) => {
        const list = trades.filter((t) => t.status === status);
        if (list.length === 0) return null;
        return (
          <section key={status} className="panel">
            <div className="panel-head">
              <span className="panel-title">{label}</span>
              <span className="muted small">{list.length} 筆</span>
            </div>
            <div className="trade-list">
              {list.map((t) => {
                const price = t.status === "closed" ? t.exit_price : (t.last?.close ?? null);
                const r = t.status === "plan" ? null : result(t, price);
                const rr =
                  t.target_price && t.entry_price !== t.stop_price
                    ? Math.abs(t.target_price - t.entry_price) / Math.abs(t.entry_price - t.stop_price)
                    : null;
                return (
                  <div key={t.id} className={`trade-row${t.alert ? ` alert-${t.alert}` : ""}`}>
                    <div className="trade-main">
                      <button className="link trade-name" onClick={() => onOpenChart(t)}>
                        {t.name} <span className="muted">{t.symbol}</span>
                      </button>
                      <span className={`tag ${t.side === "long" ? "tag-long" : "tag-short"}`}>
                        {t.side === "long" ? "多" : "空"}
                      </span>
                      {t.strategy && <span className="tag">{t.strategy}</span>}
                      {t.followed_plan === 1 && <span className="tag ok">依計畫</span>}
                      {t.followed_plan === 0 && <span className="tag bad">違反計畫</span>}
                    </div>
                    <div className="trade-levels small">
                      <span>
                        進 <b>{num(t.entry_price)}</b>
                      </span>
                      <span className="down-soft">
                        損 <b>{num(t.stop_price)}</b>
                      </span>
                      <span className="up-soft">
                        利 <b>{t.target_price ? num(t.target_price) : "—"}</b>
                      </span>
                      <span className="muted">{num(t.shares, 0)} 股</span>
                      {rr && <span className="muted">1:{rr.toFixed(1)}</span>}
                      {t.status !== "closed" && t.last && (
                        <span className="muted">
                          收 {num(t.last.close)}（{t.last.date.slice(5)}）
                        </span>
                      )}
                      {t.status === "closed" && t.exit_price && (
                        <span className="muted">
                          出 {num(t.exit_price)}（{t.exit_date?.slice(5)}）
                        </span>
                      )}
                    </div>
                    {r && (
                      <div className={`trade-result ${tone(r.pnl)}`}>
                        {signed(r.pnl)} 元{r.r != null && `｜${signed(r.r, 2)}R`}
                        {t.status === "open" && <span className="muted small">（未實現）</span>}
                      </div>
                    )}
                    {t.reason && <div className="trade-reason muted small">{t.reason}</div>}
                    {t.exit_note && <div className="trade-reason muted small">檢討：{t.exit_note}</div>}
                    <div className="trade-actions">
                      {t.status === "plan" && (
                        <button className="ghost" onClick={() => setStep({ trade: t, mode: "enter" })}>
                          進場
                        </button>
                      )}
                      {t.status === "open" && (
                        <button className="ghost" onClick={() => setStep({ trade: t, mode: "exit" })}>
                          出場
                        </button>
                      )}
                      {(t.status === "plan" || t.status === "open") && (
                        <button className="ghost" onClick={() => setEditing(t)}>
                          編輯
                        </button>
                      )}
                      {t.status === "plan" && (
                        <button className="ghost" onClick={() => act(t.id, { status: "cancelled" })}>
                          取消計畫
                        </button>
                      )}
                      <span className="grow" />
                      {confirmDelete === t.id ? (
                        <button
                          className="ghost danger"
                          onClick={async () => {
                            await deleteTrade(t.id);
                            setConfirmDelete(null);
                            await reload();
                          }}
                        >
                          確定刪除？
                        </button>
                      ) : (
                        <button className="ghost subtle" onClick={() => setConfirmDelete(t.id)}>
                          刪除
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {editing && (
        <PlanForm
          initial={editing === "new" ? null : editing}
          security={isTwStock(security.market, security.symbol) ? security : null}
          lastClose={lastClose}
          capital={capital}
          riskPct={riskPct}
          onSubmit={async (input) => {
            if (editing === "new") await createTrade(input);
            else await updateTrade(editing.id, input);
            await reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {step && (
        <StepForm
          trade={step.trade}
          mode={step.mode}
          onSubmit={(input) => act(step.trade.id, input)}
          onClose={() => setStep(null)}
        />
      )}
    </div>
  );
}
