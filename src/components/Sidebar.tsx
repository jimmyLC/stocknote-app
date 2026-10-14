import { useEffect, useRef, useState } from "react";
import {
  searchSecurities,
  type Favorite,
  type Security,
} from "../lib/api";
import { GLOBAL_INDICES, MARKET_LABEL } from "../lib/markets";
import Icon from "./Icon";

interface Props {
  current: { market: string; symbol: string };
  favorites: Favorite[];
  onSelect: (security: { market: string; symbol: string; name?: string }) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
}

export default function Sidebar({ current, favorites, onSelect, onRemove, onReorder }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Security[]>([]);
  const [open, setOpen] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      searchSecurities(q).then(setResults);
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [query]);

  function pick(s: { market: string; symbol: string; name?: string }) {
    onSelect(s);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function drop(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === target) return;
    const next = [...favorites];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    onReorder(next.map((f) => f.id));
  }

  const isCurrent = (s: { market: string; symbol: string }) =>
    s.market === current.market && s.symbol === current.symbol;

  return (
    <aside className="sidebar">
      <div className="search-box">
        <input
          value={query}
          type="search"
          aria-label="搜尋股票代號或名稱"
          placeholder="搜尋代號或名稱，例如 2330、台積電"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && results.length > 0 && (
          <div className="search-results">
            {results.map((r) => (
              <div
                key={`${r.market}:${r.symbol}`}
                className="search-item"
                onClick={() => pick(r)}
              >
                {r.market !== "TW" && <span className="tag">{MARKET_LABEL[r.market]}</span>}
                <span className="sym">{r.symbol}</span>
                <span className="nm">{r.name}</span>
                {r.kind === "index" && <span className="tag">指數</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-title">全球大盤</div>
      <div className="index-list">
        {GLOBAL_INDICES.map((x) => (
          <div
            key={`${x.market}:${x.symbol}`}
            className={`fav-item${isCurrent(x) ? " active" : ""}`}
            onClick={() => onSelect(x)}
          >
            <span className="mkt">{MARKET_LABEL[x.market]}</span>
            <span className="nm">{x.name}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-title">收藏</div>
      <div className="fav-list">
        {favorites.length === 0 && (
          <div className="muted small" style={{ padding: "6px 8px" }}>
            還沒有收藏。搜尋一檔股票，在標題旁按星號加入。
          </div>
        )}
        {favorites.map((f, i) => (
          <div
            key={f.id}
            className={`fav-item${isCurrent(f) ? " active" : ""}`}
            draggable
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(i)}
            onClick={() => onSelect({ market: f.market, symbol: f.symbol, name: f.name })}
          >
            <span className="sym">{f.symbol}</span>
            <span className="nm">{f.name}</span>
            <button
              className="rm"
              aria-label={`移除收藏 ${f.name}`}
              title="移除收藏"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(f.id);
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
