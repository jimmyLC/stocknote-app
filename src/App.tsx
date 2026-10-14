import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSession, signIn, signOut } from "./lib/auth-client";
import {
  addFavorite,
  fetchNotes,
  fetchOhlcv,
  fetchTrades,
  getFavorites,
  getNote,
  orderFavorites,
  removeFavorite,
  saveNote,
  searchSecurities,
  type Favorite,
  type Note,
  type NoteInput,
  type OhlcvResponse,
  type Trade,
} from "./lib/api";
import Sidebar from "./components/Sidebar";
import JournalDrawer from "./components/JournalDrawer";
import CalendarView from "./components/CalendarView";
import NotesPanel from "./components/NotesPanel";
import MarketView from "./components/MarketView";
import TradesView from "./components/TradesView";
import Icon from "./components/Icon";
import { MARKET_LABEL, isTwStock } from "./lib/markets";
import { getOhlcv, putOhlcv } from "./lib/offline";
import {
  DEFAULT_PREFS,
  MA_COLORS,
  MA_PERIODS,
  PERIODS,
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

// 圖表（klinecharts）延遲載入，登入頁不用下載它。
const PriceChart = lazy(() => import("./components/PriceChart"));

const DEFAULT_SECURITY: Current = { market: "TW", symbol: "0000", name: "加權指數" };

const NOTES_COLLAPSED_KEY = "stocknote:notesCollapsed";

// 窄螢幕一律先收合（展開是覆蓋式，會蓋住圖表）；寬螢幕記住上次狀態。
function loadNotesCollapsed(): boolean {
  if (window.innerWidth < 720) return true;
  try {
    const v = localStorage.getItem(NOTES_COLLAPSED_KEY);
    if (v !== null) return v === "1";
  } catch {
    // 無痕模式等情況讀不到，用預設值
  }
  return false;
}

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
        <h1 className="brand brand-lg">
          Stock<span className="brand-mark">Note</span>
        </h1>
        <p className="muted small">寫計畫、守停損、記下每一筆。</p>

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
  const [drawerNote, setDrawerNote] = useState<Note | null>(null);
  const [view, setView] = useState<"chart" | "trades" | "market" | "calendar">("chart");
  const [calendarKey, setCalendarKey] = useState(0);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [stale, setStale] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [notesCollapsed, setNotesCollapsed] = useState(loadNotesCollapsed);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const reloadTrades = useCallback(() => {
    fetchTrades().then(setTrades);
  }, []);
  useEffect(reloadTrades, [reloadTrades]);
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

  // 離線狀態
  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // 載入目前證券的日線（先顯示離線快取，再抓最新）
  useEffect(() => {
    let alive = true;
    const key = `${security.market}:${security.symbol}`;
    setLoading(true);
    setError("");
    setData(null);
    setStale(false);

    (async () => {
      const cached = await getOhlcv<OhlcvResponse>(key);
      if (!alive) return;
      if (cached) {
        setData(cached);
        setStale(true);
        setLoading(false);
      }
      try {
        const fresh = await fetchOhlcv(security.market, security.symbol);
        if (!alive) return;
        setData(fresh);
        setStale(false);
        setError("");
        setOffline(false);
        void putOhlcv(key, fresh);
      } catch (e) {
        if (!alive) return;
        const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
        if (isOffline) setOffline(true);
        if (!cached) {
          setError(
            isOffline
              ? "目前離線，且沒有這檔的快取資料"
              : e instanceof Error
                ? e.message
                : "讀取失敗",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

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

  // 外觀：<html data-theme>，index.html 開頁前也會先套一次避免閃爍
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", prefs.theme === "light" ? "#f5f6f8" : "#0f131b");
  }, [prefs.theme]);

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

  const alertCount = trades.filter((t) => t.alert).length;
  const priceLines = useMemo(
    () =>
      trades
        .filter(
          (t) =>
            (t.status === "open" || t.status === "plan") &&
            t.market === security.market &&
            t.symbol === security.symbol,
        )
        .flatMap((t) => [
          { value: t.entry_price, label: t.status === "plan" ? "計畫進場" : "進場", color: "#9aa0a6" },
          { value: t.stop_price, label: "停損", color: "#f0a020" },
          ...(t.target_price ? [{ value: t.target_price, label: "停利", color: "#4f8cff" }] : []),
        ]),
    [trades, security.market, security.symbol],
  );
  const noteByDate = useMemo(() => new Map(notes.map((x) => [x.date, x])), [notes]);
  const noteDates = useMemo(() => notes.map((x) => x.date), [notes]);

  // 抽屜要顯示的筆記：本地清單沒有（例如剛從別檔切過來）就單獨抓
  useEffect(() => {
    if (!drawerDate) {
      setDrawerNote(null);
      return;
    }
    const local = noteByDate.get(drawerDate);
    if (local) {
      setDrawerNote(local);
      return;
    }
    let alive = true;
    setDrawerNote(null);
    getNote(security.market, security.symbol, drawerDate).then(
      (n) => alive && setDrawerNote(n),
    );
    return () => {
      alive = false;
    };
  }, [drawerDate, noteByDate, security.market, security.symbol]);

  const drawerIndex = drawerDate ? bars.findIndex((b) => b.date === drawerDate) : -1;
  const drawerBar = drawerIndex >= 0 ? bars[drawerIndex] : null;
  const drawerPrev = drawerIndex > 0 ? bars[drawerIndex - 1].close : null;

  async function refreshNotes() {
    if (data) {
      setNotes(await fetchNotes(security.market, security.symbol, data.from, data.to));
    }
    setCalendarKey((k) => k + 1);
  }

  async function handleSaveNote(values: Omit<NoteInput, "market" | "symbol" | "date">) {
    if (!drawerDate) return;
    await saveNote({
      market: security.market,
      symbol: security.symbol,
      date: drawerDate,
      ...values,
    });
    await refreshNotes();
  }

  async function handleDeleteNote() {
    if (!drawerDate) return;
    await saveNote({
      market: security.market,
      symbol: security.symbol,
      date: drawerDate,
      title: "",
      body: "",
      tags: [],
      mood: "",
    });
    setDrawerDate(null);
    await refreshNotes();
  }

  function stepDate(delta: number) {
    if (!drawerDate) return;
    const i = bars.findIndex((b) => b.date === drawerDate);
    if (i < 0) return;
    const j = Math.min(bars.length - 1, Math.max(0, i + delta));
    setDrawerDate(bars[j].date);
  }

  function toggleNotes() {
    setNotesCollapsed((c) => {
      try {
        if (window.innerWidth >= 720) localStorage.setItem(NOTES_COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // 存不了就只在這次有效
      }
      return !c;
    });
  }

  // 從日曆／最近筆記點一則：切到該證券並直接開抽屜（不換回 K 線檢視）
  function openNote(market: string, symbol: string, date: string, name?: string) {
    const favorite = favorites.find((f) => f.market === market && f.symbol === symbol);
    setSecurity({ market, symbol, name: name ?? favorite?.name ?? symbol });
    history.replaceState(null, "", `${location.pathname}?s=${market}:${symbol}`);
    setDrawerDate(date);
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="icon-btn"
          aria-label="顯示或隱藏側邊欄"
          aria-pressed={sidebarOpen}
          onClick={() => setSidebarOpen((o) => !o)}
        >
          <Icon name="menu" />
        </button>
        <span className="brand">
          Stock<span className="brand-mark">Note</span>
        </span>
        <nav className="tabs" aria-label="主要頁面">
          {(
            [
              ["chart", "看盤"],
              ["trades", "交易計畫"],
              ["market", "市場數據"],
              ["calendar", "筆記日曆"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`tab${view === key ? " active" : ""}`}
              aria-current={view === key ? "page" : undefined}
              onClick={() => setView(key)}
            >
              {label}
              {key === "trades" && alertCount > 0 && (
                <span className="badge" aria-label={`${alertCount} 筆需要處理`}>
                  {alertCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <span className="grow" />
        <span className="user-email">{email}</span>
        <button className="icon-btn" aria-label="登出" title="登出" onClick={() => signOut()}>
          <Icon name="logout" />
        </button>
      </header>

      {offline && (
        <div className="banner">
          目前離線：圖表顯示上次的快取資料；交易日誌需要連線才能讀取與儲存。
        </div>
      )}

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
              <section className="quote">
                <div className="quote-id">
                  <h1 className="quote-name">{security.name}</h1>
                  <span className="quote-code">
                    {security.market !== "TW" && (
                      <span className="mkt">{MARKET_LABEL[security.market] ?? security.market}</span>
                    )}
                    {security.symbol}
                  </span>
                  <button
                    className={`icon-btn star${fav ? " on" : ""}`}
                    aria-label={fav ? "移除收藏" : "加入收藏"}
                    aria-pressed={!!fav}
                    title={fav ? "移除收藏" : "加入收藏"}
                    onClick={toggleFavorite}
                  >
                    <Icon name="star" filled={!!fav} />
                  </button>
                  {isTwStock(security.market, security.symbol) && (
                    <span className="tag warn" title="個股價格未做除權息還原，長均線可能受除息缺口影響">
                      未還原
                    </span>
                  )}
                </div>
                {last && (
                  <div className="quote-price">
                    <span className={`price ${dir}`}>{n(last.close)}</span>
                    <span className={`change ${dir}`}>
                      {change >= 0 ? "▲" : "▼"} {n(Math.abs(change))}　{pct >= 0 ? "+" : ""}
                      {pct.toFixed(2)}%
                    </span>
                  </div>
                )}
                {last && (
                  <dl className="quote-ohlc">
                    <div><dt>開</dt><dd>{n(last.open)}</dd></div>
                    <div><dt>高</dt><dd>{n(last.high)}</dd></div>
                    <div><dt>低</dt><dd>{n(last.low)}</dd></div>
                    {security.market === "TW" && (
                      <div><dt>成交金額</dt><dd>{Math.round(last.turnover / 1e8).toLocaleString()} 億</dd></div>
                    )}
                    <div><dt>日期</dt><dd>{last.date}</dd></div>
                  </dl>
                )}
                <span className="grow" />
                <button
                  className="primary"
                  disabled={!last}
                  onClick={() =>
                    setDrawerDate(last ? last.date : new Date().toISOString().slice(0, 10))
                  }
                >
                  <Icon name="plus" size={16} />
                  寫筆記
                </button>
              </section>

              <div className="toolbar">
                <div className="toolbar-view">
                  <div className="seg" role="group" aria-label="顯示區間">
                    {RANGES.map(([label, value]) => (
                      <button
                        key={label}
                        className={prefs.range === value ? "active" : ""}
                        onClick={() => {
                          update((p) => ({ ...p, range: value }));
                          setResetKey((k) => k + 1);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="seg" role="group" aria-label="K 棒週期">
                    {PERIODS.map(([label, value]) => (
                      <button
                        key={value}
                        className={prefs.period === value ? "active" : ""}
                        onClick={() => update((p) => ({ ...p, period: value }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="ghost tools-toggle"
                    aria-expanded={toolsOpen}
                    onClick={() => setToolsOpen((o) => !o)}
                  >
                    <Icon name="sliders" size={16} />
                    指標
                  </button>
                </div>
                <div className={`toolbar-indicators${toolsOpen ? " open" : ""}`}>
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
                  {security.market === "TW" ? "成交金額" : "成交量"}
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

                </div>
              </div>

              <div className="chart-wrap">
                {loading && <div className="placeholder muted">載入中…</div>}
                {!loading && error && <div className="placeholder error">{error}</div>}
                {!loading && !error && bars.length > 0 && (
                  <Suspense fallback={<div className="placeholder muted">載入圖表中…</div>}>
                    <PriceChart
                      bars={bars}
                      prefs={prefs}
                      symbol={`${security.market}:${security.symbol}`}
                      volumeLabel={security.market === "TW" ? "成交金額" : "成交量"}
                      priceLines={priceLines}
                      noteDates={noteDates}
                      theme={prefs.theme}
                      resetKey={resetKey}
                      onPickDate={(d) => setDrawerDate(d)}
                    />
                  </Suspense>
                )}
              </div>
            </>
          ) : view === "trades" ? (
            <TradesView
              security={security}
              lastClose={last?.close ?? null}
              capital={prefs.capital}
              riskPct={prefs.riskPct}
              onSettings={(patch) => update((p) => ({ ...p, ...patch }))}
              onOpenChart={(t) => {
                select(t);
                setView("chart");
              }}
              onChanged={reloadTrades}
            />
          ) : view === "market" ? (
            <MarketView />
          ) : (
            <CalendarView
              onOpen={(n) => openNote(n.market, n.symbol, n.date)}
              refreshKey={calendarKey}
            />
          )}

          <footer className="footer">
            <span>
              資料僅供參考，非投資建議。來源：FinMind、臺灣證券交易所、Naver、Yahoo Finance
              {data && view === "chart" && `（本圖：${data.provider}${stale ? "，離線快取" : ""}）`}
            </span>
            <div className="seg theme-toggle" role="group" aria-label="外觀">
              <button
                className={prefs.theme === "light" ? "active" : ""}
                aria-pressed={prefs.theme === "light"}
                onClick={() => update((p) => ({ ...p, theme: "light" }))}
              >
                <Icon name="sun" size={14} />
                淺色
              </button>
              <button
                className={prefs.theme === "dark" ? "active" : ""}
                aria-pressed={prefs.theme === "dark"}
                onClick={() => update((p) => ({ ...p, theme: "dark" }))}
              >
                <Icon name="moon" size={14} />
                深色
              </button>
            </div>
          </footer>
        </div>

        {drawerDate === null && (
          <NotesPanel
            current={security}
            refreshKey={calendarKey}
            collapsed={notesCollapsed}
            onToggle={toggleNotes}
            onOpen={(n) => openNote(n.market, n.symbol, n.date, n.name)}
          />
        )}

        <JournalDrawer
          open={drawerDate !== null}
          market={security.market}
          symbol={security.symbol}
          name={security.name}
          date={drawerDate}
          min={data?.from ?? ""}
          max={data?.to ?? ""}
          note={drawerNote}
          bar={drawerBar}
          prevClose={drawerPrev}
          offline={offline}
          onDateChange={(d) => setDrawerDate(d)}
          onStep={stepDate}
          onSave={handleSaveNote}
          onDelete={handleDeleteNote}
          onClose={() => setDrawerDate(null)}
        />
      </div>
    </div>
  );
}
