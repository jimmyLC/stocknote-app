import { useEffect, useState, type FormEvent } from "react";
import { useSession, signIn, signOut } from "./lib/auth-client";
import { fetchOhlcv, type OhlcvResponse } from "./lib/api";
import PriceChart from "./components/PriceChart";

const INDEX = { market: "TW", symbol: "0000", name: "加權指數" };

export default function App() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div className="center muted">載入中…</div>;
  }
  if (!session) {
    return <Login />;
  }
  return <Home email={session.user.email} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await signIn.email({ email, password });
      if (res.error) setError(res.error.message ?? "登入失敗");
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生錯誤，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1 className="brand">台股筆記</h1>
        <p className="muted small">登入以繼續</p>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="error small">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}

function Home({ email }: { email: string }) {
  const [data, setData] = useState<OhlcvResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchOhlcv(INDEX.market, INDEX.symbol)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "讀取失敗"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const bars = data?.bars ?? [];
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const change = last && prev ? last.close - prev.close : 0;
  const pct = last && prev ? (change / prev.close) * 100 : 0;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "";
  const n = (v: number, digits = 2) =>
    v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand small">台股筆記</span>
        <span className="grow" />
        <span className="muted small">{email}</span>
        <button className="ghost" onClick={() => signOut()}>
          登出
        </button>
      </header>

      <section className="symbol-bar">
        <span className="symbol-name">{INDEX.name}</span>
        <span className="symbol-code">({INDEX.symbol})</span>
        {last && (
          <>
            <span className={`price ${dir}`}>{n(last.close)}</span>
            <span className={`change ${dir}`}>
              {change >= 0 ? "▲" : "▼"} {n(Math.abs(change))} ({pct.toFixed(2)}%)
            </span>
            <span className="muted small">
              開 {n(last.open)}　高 {n(last.high)}　低 {n(last.low)}　成交金額{" "}
              {Math.round(last.turnover / 1e8).toLocaleString()} 億
            </span>
          </>
        )}
        <span className="grow" />
        {data && (
          <span className="muted small">
            {data.provider}｜{data.from} ~ {data.to}
            {data.cached ? "｜快取" : ""}
          </span>
        )}
      </section>

      <div className="chart-wrap">
        {loading && <div className="placeholder muted">載入中…</div>}
        {!loading && error && <div className="placeholder error">{error}</div>}
        {!loading && !error && bars.length > 0 && (
          <PriceChart key={`${INDEX.market}:${INDEX.symbol}`} bars={bars} />
        )}
      </div>

      <footer className="footer muted small">
        資料僅供參考，非投資建議。資料來源：FinMind／臺灣證券交易所。
      </footer>
    </div>
  );
}
