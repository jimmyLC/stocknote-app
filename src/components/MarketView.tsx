import { useEffect, useMemo, useState } from "react";
import { fetchMarket, type MarketData } from "../lib/api";
import SeriesChart from "./SeriesChart";

// 市場數據：三大法人現貨買賣超、融資餘額、融資維持率（估算）。
// 要加新數據：後端 worker/marketData.ts 加 fetcher、/api/market 帶出來，這裡加一張卡片＋一張圖。

const RANGES: Array<[string, number]> = [
  ["1M", 22],
  ["3M", 63],
  ["6M", 126],
  ["1Y", 250],
];

type Who = "total" | "foreign" | "trust" | "dealer";
const WHO: Array<[Who, string]> = [
  ["total", "合計"],
  ["foreign", "外資"],
  ["trust", "投信"],
  ["dealer", "自營商"],
];

const yi = (v: number) => `${(v / 1e8).toLocaleString(undefined, { maximumFractionDigits: 0 })} 億`;
const yiSigned = (v: number) =>
  `${v > 0 ? "+" : ""}${(v / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })} 億`;
const pct = (v: number) => `${v.toFixed(1)}%`;
const tone = (v: number) => (v > 0 ? "up" : v < 0 ? "down" : "");

export default function MarketView() {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState(63);
  const [who, setWho] = useState<Who>("total");

  useEffect(() => {
    let alive = true;
    fetchMarket()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "讀取失敗"));
    return () => {
      alive = false;
    };
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const inst = data.institutional.slice(-range);
    const margin = data.margin.slice(-range);
    const cutoff = inst[0]?.date ?? margin[0]?.date ?? "";
    const maint = data.maintenance.filter((m) => m.date >= cutoff);
    const taiex = data.taiex.map((t) => ({ date: t.date, value: t.close }));
    return { inst, margin, maint, taiex };
  }, [data, range]);

  if (error) return <div className="market"><div className="placeholder error">{error}</div></div>;
  if (!data || !view) return <div className="market"><div className="placeholder muted">載入市場數據…</div></div>;

  const lastInst = data.institutional.at(-1);
  const lastMargin = data.margin.at(-1);
  const prevMargin = data.margin.at(-2);
  const lastMaint = data.maintenance.at(-1);
  const prevMaint = data.maintenance.at(-2);
  const marginDelta = lastMargin && prevMargin ? lastMargin.balance - prevMargin.balance : 0;
  const maintDelta = lastMaint && prevMaint ? lastMaint.value - prevMaint.value : 0;
  const maintLevel = !lastMaint ? "" : lastMaint.value < 140 ? "danger" : lastMaint.value < 160 ? "warn" : "ok";

  return (
    <div className="market">
      <div className="market-bar">
        <span className="section-title">市場數據</span>
        <span className="muted small">上市｜{lastInst?.date ?? "-"}</span>
        <span className="grow" />
        <div className="seg">
          {RANGES.map(([label, n]) => (
            <button key={label} className={range === n ? "active" : ""} onClick={() => setRange(n)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="stat-grid">
        {lastInst &&
          WHO.map(([k, label]) => (
            <div key={k} className="stat">
              <div className="stat-label">{label}買賣超</div>
              <div className={`stat-value ${tone(lastInst[k])}`}>{yiSigned(lastInst[k])}</div>
            </div>
          ))}
        {lastMargin && (
          <div className="stat">
            <div className="stat-label">融資餘額</div>
            <div className="stat-value">{yi(lastMargin.balance)}</div>
            <div className={`stat-sub ${tone(marginDelta)}`}>日增減 {yiSigned(marginDelta)}</div>
          </div>
        )}
        <div className={`stat ${maintLevel}`}>
          <div className="stat-label">融資維持率（估算）</div>
          <div className="stat-value">{lastMaint ? pct(lastMaint.value) : "計算中"}</div>
          {lastMaint && (
            <div className={`stat-sub ${tone(maintDelta)}`}>
              日增減 {maintDelta > 0 ? "+" : ""}
              {maintDelta.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">三大法人現貨買賣超</span>
          <span className="grow" />
          <div className="seg">
            {WHO.map(([k, label]) => (
              <button key={k} className={who === k ? "active" : ""} onClick={() => setWho(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <SeriesChart
          kind="bar"
          data={view.inst.map((d) => ({ date: d.date, value: d[who] }))}
          format={yiSigned}
          overlay={{ label: "加權指數", data: view.taiex }}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">融資餘額</span>
        </div>
        <SeriesChart
          kind="line"
          data={view.margin.map((d) => ({ date: d.date, value: d.balance }))}
          format={yi}
          overlay={{ label: "加權指數", data: view.taiex }}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">融資維持率（估算）</span>
          <span className="muted small">
            {data.maintenance.length < 200 && `歷史資料補齊中（目前 ${data.maintenance.length} 天，每小時自動補）`}
          </span>
        </div>
        <SeriesChart
          kind="line"
          data={view.maint}
          format={pct}
          overlay={{ label: "加權指數", data: view.taiex }}
          refLines={[
            { value: 160, label: "160% 偏低", tone: "warn" },
            { value: 140, label: "140% 斷頭潮風險", tone: "danger" },
          ]}
        />
        <p className="muted small panel-note">
          估算方式：上市各股「融資餘額 × 收盤價」加總 ÷ 融資金額（資料：臺灣證券交易所）。
          證交所 2026/07/29 起不再公布官方數字；實際維持率依各券商整戶計算，個人追繳門檻為 130%。
        </p>
      </section>

      <p className="muted small panel-note">資料來源：FinMind（三大法人、融資餘額）、臺灣證券交易所（維持率估算）。</p>
    </div>
  );
}
