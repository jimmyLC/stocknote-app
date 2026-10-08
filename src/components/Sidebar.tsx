import { useEffect, useRef, useState } from "react";
import {
  searchSecurities,
  type Favorite,
  type Security,
} from "../lib/api";

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
          placeholder="搜尋代號或名稱"
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
                <span className="sym">{r.symbol}</span>
                <span className="nm">{r.name}</span>
                {r.kind === "index" && <span className="tag">指數</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-title">收藏</div>
      <div className="fav-list">
        {favorites.length === 0 && (
          <div className="muted small" style={{ padding: "6px 8px" }}>
            還沒有收藏，用上面的搜尋加入。
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
              title="移除收藏"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(f.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
