import { useEffect, useMemo, useState, type FormEvent } from "react";
import { fetchOhlcv, searchSecurities, type Security, type Trade, type TradeInput, type TradeSide } from "../lib/api";
import { checkPlan } from "../lib/risk";
import Icon from "./Icon";

const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const money = (v: number) => `${Math.round(v).toLocaleString()} 元`;

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

interface PlanProps {
  initial?: Trade | null;
  /** 預設帶入的股票；看的是指數時為 null（指數不能下單），要自己選 */
  security: { market: string; symbol: string; name: string } | null;
  lastClose?: number | null;
  capital: number;
  riskPct: number;
  onSubmit: (input: TradeInput) => Promise<void>;
  onClose: () => void;
}

/** 新增／編輯交易計畫：寫好進場、停損、停利，並即時算風險。 */
export function PlanForm({ initial, security, lastClose, capital, riskPct, onSubmit, onClose }: PlanProps) {
  const [sec, setSec] = useState(
    initial ? { market: initial.market, symbol: initial.symbol, name: initial.name } : security,
  );
  const [pickedClose, setPickedClose] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Security[]>([]);
  const [side, setSide] = useState<TradeSide>(initial?.side ?? "long");
  const [entry, setEntry] = useState(
    String(initial?.entry_price ?? (security ? lastClose : null) ?? ""),
  );
  const [stop, setStop] = useState(String(initial?.stop_price ?? ""));
  const [target, setTarget] = useState(String(initial?.target_price ?? ""));
  const [shares, setShares] = useState(String(initial?.shares ?? ""));
  const [strategy, setStrategy] = useState(initial?.strategy ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEscape(onClose);

  useEffect(() => {
    const q = query.trim();
    if (!q) return setResults([]);
    const t = window.setTimeout(() => searchSecurities(q).then(setResults), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const check = useMemo(
    () =>
      checkPlan({
        side,
        entry: Number(entry) || 0,
        stop: Number(stop) || 0,
        target: Number(target) || null,
        shares: Number(shares) || 0,
        capital,
        riskPct,
      }),
    [side, entry, stop, target, shares, capital, riskPct],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!sec) return setError("請先選擇股票");
    if (check.errors.length) return setError(check.errors[0]);
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        market: sec.market,
        symbol: sec.symbol,
        side,
        entry_price: Number(entry),
        stop_price: Number(stop),
        target_price: target ? Number(target) : null,
        shares: Number(shares),
        strategy: strategy.trim() || null,
        reason: reason.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <span className="modal-title">{initial ? "編輯交易計畫" : "新交易計畫"}</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉">
            <Icon name="x" />
          </button>
        </div>

        <div className="field">
          股票
          <div className="picker">
            {sec && (
              <span className="picker-current">
                {sec.name} <span className="muted">({sec.symbol})</span>
              </span>
            )}
            <input
              value={query}
              autoFocus={!sec}
              aria-label="搜尋股票"
              placeholder={sec ? "換一檔：輸入代號或名稱" : "輸入代號或名稱，例如 2330"}
              onChange={(e) => setQuery(e.target.value)}
            />
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r) => (
                  <div
                    key={`${r.market}:${r.symbol}`}
                    className="search-item"
                    onClick={() => {
                      setSec(r);
                      setQuery("");
                      setResults([]);
                      setPickedClose(null);
                      // 帶入最近收盤當進場價參考（沒填過才帶）
                      fetchOhlcv(r.market, r.symbol)
                        .then((d) => {
                          const c = d.bars.at(-1)?.close ?? null;
                          setPickedClose(c);
                          if (c) setEntry((e) => e || String(c));
                        })
                        .catch(() => undefined);
                    }}
                  >
                    <span className="sym">{r.symbol}</span>
                    <span className="nm">{r.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {pickedClose != null && (
          <p className="muted small" style={{ margin: "-6px 0 0" }}>
            最近收盤 {pickedClose.toLocaleString()}
          </p>
        )}

        <div className="field">
          方向
          <div className="seg">
            <button type="button" className={side === "long" ? "active" : ""} onClick={() => setSide("long")}>
              做多
            </button>
            <button type="button" className={side === "short" ? "active" : ""} onClick={() => setSide("short")}>
              做空
            </button>
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            進場價
            <input type="number" step="any" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} required />
          </label>
          <label className="field">
            停損價
            <input type="number" step="any" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} required />
          </label>
          <label className="field">
            停利價
            <input type="number" step="any" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="field">
            股數（1 張 = 1000 股）
            <input type="number" step="1" inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value)} required />
          </label>
        </div>

        <div className="risk-box">
          <div className="risk-row">
            <span className="muted">風險報酬比</span>
            <strong className={check.rr != null && check.rr < 2 ? "warn-text" : ""}>
              {check.rr != null && check.rr > 0 ? `1 : ${check.rr.toFixed(2)}` : "—"}
            </strong>
          </div>
          <div className="risk-row">
            <span className="muted">停損最多賠</span>
            <strong>
              {money(check.riskAmount)}
              <span className="muted">（總資金 {check.riskPctOfCapital.toFixed(2)}%）</span>
            </strong>
          </div>
          <div className="risk-row">
            <span className="muted">
              建議股數（每筆最多賠 {riskPct}%＝{money((capital * riskPct) / 100)}）
            </span>
            <span>
              <strong>{check.suggestedShares.toLocaleString()} 股</strong>
              {check.suggestedShares > 0 && (
                <button type="button" className="link" onClick={() => setShares(String(check.suggestedShares))}>
                  套用
                </button>
              )}
            </span>
          </div>
          {check.errors.concat(check.warnings).map((w) => (
            <div key={w} className={check.errors.includes(w) ? "error small" : "warn-text small"}>
              ⚠ {w}
            </div>
          ))}
        </div>

        <label className="field">
          策略／型態
          <input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="例如：突破、拉回月線、底部爆量" />
        </label>
        <label className="field">
          進場理由
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="為什麼是現在？哪個訊號？什麼情況代表我錯了？" />
        </label>

        {error && <p className="error small">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={busy || check.errors.length > 0}>
            {busy ? "儲存中…" : "儲存計畫"}
          </button>
        </div>
      </form>
    </div>
  );
}

interface StepProps {
  trade: Trade;
  mode: "enter" | "exit";
  onSubmit: (input: TradeInput) => Promise<void>;
  onClose: () => void;
}

/** 進場（計畫 → 持有中）或出場（持有中 → 已出場＋檢討）。 */
export function StepForm({ trade, mode, onSubmit, onClose }: StepProps) {
  const [date, setDate] = useState(today());
  const defaultPrice =
    mode === "enter"
      ? trade.entry_price
      : trade.alert === "stop"
        ? trade.stop_price
        : trade.alert === "target"
          ? (trade.target_price ?? trade.last?.close)
          : trade.last?.close;
  const [price, setPrice] = useState(String(defaultPrice ?? ""));
  const [followed, setFollowed] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEscape(onClose);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "exit" && followed === null) return setError("請選擇這次出場有沒有照計畫");
    try {
      await onSubmit(
        mode === "enter"
          ? { status: "open", entry_date: date, entry_price: Number(price) }
          : {
              status: "closed",
              exit_date: date,
              exit_price: Number(price),
              followed_plan: followed,
              exit_note: note.trim() || null,
            },
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal narrow" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <span className="modal-title">
            {mode === "enter" ? "進場" : "出場"}・{trade.name}
          </span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉">
            <Icon name="x" />
          </button>
        </div>
        <div className="form-grid">
          <label className="field">
            日期
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            {mode === "enter" ? "實際進場價" : "出場價"}
            <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </label>
        </div>
        {mode === "exit" && (
          <>
            <div className="field">
              有照計畫嗎？
              <div className="seg">
                <button type="button" className={followed === true ? "active" : ""} onClick={() => setFollowed(true)}>
                  依計畫出場
                </button>
                <button type="button" className={followed === false ? "active" : ""} onClick={() => setFollowed(false)}>
                  違反計畫
                </button>
              </div>
            </div>
            <label className="field">
              檢討
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="做對什麼？下次要改什麼？" />
            </label>
          </>
        )}
        {error && <p className="error small">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit">{mode === "enter" ? "確認進場" : "確認出場"}</button>
        </div>
      </form>
    </div>
  );
}
