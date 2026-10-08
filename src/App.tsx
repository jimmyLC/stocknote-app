import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSession, signIn, signOut } from "./lib/auth-client";
import {
  addFavorite,
  fetchNotes,
  fetchOhlcv,
  getFavorites,
  orderFavorites,
  removeFavorite,
  saveNote,
  searchSecurities,
  type CalendarNote,
  type Favorite,
  type Note,
  type NoteInput,
  type OhlcvResponse,
} from "./lib/api";
import PriceChart from "./components/PriceChart";
import Sidebar from "./components/Sidebar";
import JournalDrawer from "./components/JournalDrawer";
import CalendarView from "./components/CalendarView";
import {
  DEFAULT_PREFS,
  MA_COLORS,
  MA_PERIODS,
  RANGES,
  fetchPrefs,
  loadLocalPrefs,
  putPrefs,
  saveLocalPrefs,
  type Prefs,
} from "./lib/prefs";

interface Current {
  market: string;
  symbol: string;
  name: string;
}

const DEFAULT_SECURITY: Current = { market: "TW", symbol: "0000", name: "加權指數" };

function readFromUrl(): Current {
  const s = new URLSearchParams(location.search).get("s");
  if (s && s.includes(":")) {
    const [market, symbol] = s.split(":");
    return { market: market.toUpperCase(), symbol, name: symbol };
  }
  return DEFAULT_SECURITY;
}

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
  const [security, setSecurity] = useState<Current>(readFromUrl);
  const [data, setData] = useState<OhlcvResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Prefs>(() => loadLocalPrefs() ?? DEFAULT_PREFS);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640);
  const [notes, setNotes] = useState<Note[]>([]);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "calendar">("chart");
  const [calendarKey, setCalendarKey] = useState(0);
  const prefsRef = useRef(prefs);
  const saveTimer = useRef<number | undefined>(undefined);

  const reloadFavorites = useCallback(() => {
    getFavorites().then(setFavorites);
  }, []);

  useEffect(() => {
    reloadFavorites();
    fetchPrefs().then((p) => {
      if (p) {
        prefsRef.current = p;
        setPrefs(p);
        saveLocalPrefs(p);
      }
    });
  }, [reloadFavorites]);

  // 載入目前證券的日線
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setData(null); // 清掉舊資料，避免標題顯示上一檔的數字
    fetchOhlcv(security.market, security.symbol)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "讀取失敗"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [security.market, security.symbol]);

  // 載入目前證券的筆記
  useEffect(() => {
    if (!data) return;
    let alive = true;
    fetchNotes(security.market, security.symbol, data.from, data.to).then(
      (n) => alive && setNotes(n),
    );
    return () => {
      alive = false;
    };
  }, [data, security.market, security.symbol]);

  // 若目前證券在收藏內，補上名稱
  useEffect(() => {
    const f = favorites.find(
      (x) => x.market === security.market && x.symbol === security.symbol,
    );
    if (f && f.name && f.name !== security.name) {
      setSecurity((c) => ({ ...c, name: f.name }));
    }
  }, [favorites, security.market, security.symbol, security.name]);

  // 從網址載入時名稱未知（name === symbol），查主檔補上
  useEffect(() => {
    if (security.name !== security.symbol) return;
    let alive = true;
    searchSecurities(security.symbol).then((list) => {
      const hit = list.find(
        (s) => s.symbol === security.symbol && s.market === security.market,
      );
      if (alive && hit) setSecurity((c) => ({ ...c, name: hit.name }));
    });
    return () => {
      alive = false;
    };
  }, [security.market, security.symbol, security.name]);

  function apply(next: Prefs) {
    prefsRef.current = next;
    setPrefs(next);
    saveLocalPrefs(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void putPrefs(next), 500);
  }
  function update(patch: (p: Prefs) => Prefs) {
    apply(patch(prefsRef.current));
  }

  function select(s: { market: string; symbol: string; name?: string }) {
    const next: Current = { market: s.market, symbol: s.symbol, name: s.name ?? s.symbol };
    setSecurity(next);
    setDrawerDate(null);
    history.replaceState(null, "", `${location.pathname}?s=${next.market}:${next.symbol}`);
  }

  const fav = favorites.find(
    (f) => f.market === security.market && f.symbol === security.symbol,
  );

  async function toggleFavorite() {
    if (fav) await removeFavorite(fav.id);
    else await addFavorite(security.market, security.symbol);
    reloadFavorites();
  }

  const bars = data?.bars ?? [];
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const change = last && prev ? last.close - prev.close : 0;
  const pct = last && prev ? (change / prev.close) * 100 : 0;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "";
  const n = (v: number, digits = 2) =>
    v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const noteByDate = useMemo(() => new Map(notes.map((x) => [x.date, x])), [notes]);
  const noteDates = useMemo(() => notes.map((x) => x.date), [notes]);

  const drawerIndex = drawerDate ? bars.findIndex((b) => b.date === drawerDate) : -1;
  const drawerBar = drawerIndex >= 0 ? bars[drawerIndex] : null;
  const drawerPrev = drawerIndex > 0 ? bars[drawerIndex - 1].close : null;

  async function handleSaveNote(values: Omit<NoteInput, "market" | "symbol" | "date">) {
    if (!drawerDate) return;
    await saveNote({
      market: security.market,
      symbol: security.symbol,
      date: drawerDate,
      ...values,
    });
    if (data) {
      setNotes(await fetchNotes(security.market, security.symbol, data.from, data.to));
    }
    setCalendarKey((k) => k + 1);
  }

  function openFromCalendar(item: CalendarNote) {
    select({ market: item.market, symbol: item.symbol });
    setView("chart");
    setDrawerDate(item.date);
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="ghost icon"
          title="顯示/隱藏收藏"
          onClick={() => setSidebarOpen((o) => !o)}
        >
          ☰
        </button>
        <span className="brand small">台股筆記</span>
        <div className="seg" style={{ marginLeft: 12 }}>
          <button className={view === "chart" ? "active" : ""} onClick={() => setView("chart")}>
            圖表
          </button>
          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            日曆
          </button>
        </div>
        <span className="grow" />
        <span className="muted small">{email}</span>
        <button className="ghost" onClick={() => signOut()}>
          登出
        </button>
      </header>

      <div className="body">
        {sidebarOpen && (
          <Sidebar
            current={{ market: security.market, symbol: security.symbol }}
            favorites={favorites}
            onSelect={select}
            onRemove={async (id) => {
              await removeFavorite(id);
              reloadFavorites();
            }}
            onReorder={async (ids) => {
              setFavorites((prevFavs) =>
                ids
                  .map((id) => prevFavs.find((f) => f.id === id))
                  .filter((f): f is Favorite => !!f),
              );
              await orderFavorites(ids);
            }}
          />
        )}

        <div className="main">
          {view === "chart" ? (
            <>
              <section className="symbol-bar">
                <span className="symbol-name">{security.name}</span>
                <span className="symbol-code">({security.symbol})</span>
                <button
                  className={`star${fav ? " on" : ""}`}
                  title={fav ? "移除收藏" : "加入收藏"}
                  onClick={toggleFavorite}
                >
                  {fav ? "★" : "☆"}
                </button>
                {security.symbol !== "0000" && <span className="tag warn">未還原</span>}
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
                <button
                  className="primary"
                  disabled={!last}
                  onClick={() =>
                    setDrawerDate(last ? last.date : new Date().toISOString().slice(0, 10))
                  }
                >
                  ＋ 寫筆記
                </button>
              </section>

              <div className="toolbar">
                <span className="toolbar-label">均線</span>
                {MA_PERIODS.map((period) => {
                  const key = String(period);
                  const on = !!prefs.ma[key];
                  return (
                    <label
                      key={period}
                      className="chk"
                      style={{ color: on ? MA_COLORS[period] : "var(--muted)" }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          update((p) => ({ ...p, ma: { ...p.ma, [key]: !p.ma[key] } }))
                        }
                      />
                      MA{period}
                    </label>
                  );
                })}

                <span className="toolbar-sep" />
                <span className="toolbar-label">面板</span>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={prefs.vol}
                    onChange={() => update((p) => ({ ...p, vol: !p.vol }))}
                  />
                  成交量
                </label>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={prefs.macd}
                    onChange={() => update((p) => ({ ...p, macd: !p.macd }))}
                  />
                  MACD
                </label>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={prefs.kdj}
                    onChange={() => update((p) => ({ ...p, kdj: !p.kdj }))}
                  />
                  KD
                </label>

                <span className="toolbar-sep" />
                <span className="toolbar-label">區間</span>
                <div className="seg">
                  {RANGES.map(([label, value]) => (
                    <button
                      key={label}
                      className={prefs.range === value ? "active" : ""}
                      onClick={() => update((p) => ({ ...p, range: value }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="grow" />
                <span className="muted small">點 K 線、或用上方「＋ 寫筆記」來記錄</span>
              </div>

              <div className="chart-wrap">
                {loading && <div className="placeholder muted">載入中…</div>}
                {!loading && error && <div className="placeholder error">{error}</div>}
                {!loading && !error && bars.length > 0 && (
                  <PriceChart
                    bars={bars}
                    prefs={prefs}
                    symbol={`${security.market}:${security.symbol}`}
                    noteDates={noteDates}
                    onPickDate={(d) => setDrawerDate(d)}
                  />
                )}
              </div>
            </>
          ) : (
            <CalendarView onOpen={openFromCalendar} refreshKey={calendarKey} />
          )}

          <footer className="footer muted small">
            資料僅供參考，非投資建議。資料來源：FinMind／臺灣證券交易所。
          </footer>
        </div>

        <JournalDrawer
          open={view === "chart" && drawerDate !== null}
          market={security.market}
          symbol={security.symbol}
          name={security.name}
          date={drawerDate}
          min={data?.from ?? ""}
          max={data?.to ?? ""}
          note={drawerDate ? noteByDate.get(drawerDate) ?? null : null}
          bar={drawerBar}
          prevClose={drawerPrev}
          onDateChange={(d) => setDrawerDate(d)}
          onSave={handleSaveNote}
          onClose={() => setDrawerDate(null)}
        />
      </div>
    </div>
  );
}
