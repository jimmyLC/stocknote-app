import { useEffect, useState } from "react";
import { fetchRecentNotes, type RecentNote } from "../lib/api";
import Icon from "./Icon";

interface Props {
  current: { market: string; symbol: string; name: string };
  refreshKey: number;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (note: { date: string; market: string; symbol: string; name: string }) => void;
}

// 右側「最近筆記」：依日期由新到舊，可收合；可切換「全部 / 只看這檔」。
export default function NotesPanel({ current, refreshKey, collapsed, onToggle, onOpen }: Props) {
  const [scope, setScope] = useState<"all" | "this">("all");
  const [notes, setNotes] = useState<RecentNote[] | null>(null);

  useEffect(() => {
    if (collapsed) return;
    let alive = true;
    fetchRecentNotes(scope === "this" ? current : undefined).then((n) => alive && setNotes(n));
    return () => {
      alive = false;
    };
  }, [collapsed, scope, current.market, current.symbol, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (collapsed) {
    return (
      <aside className="notes-rail">
        <button className="rail-btn" aria-label="展開最近筆記" aria-expanded={false} onClick={onToggle}>
          <Icon name="chevronLeft" size={16} />
          <span className="rail-label">最近筆記</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="notes-panel">
      <div className="notes-head">
        <span className="drawer-title">最近筆記</span>
        <span className="grow" />
        <div className="seg">
          <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
            全部
          </button>
          <button className={scope === "this" ? "active" : ""} onClick={() => setScope("this")}>
            這檔
          </button>
        </div>
        <button className="icon-btn" aria-label="收合最近筆記" aria-expanded onClick={onToggle}>
          <Icon name="chevronRight" size={16} />
        </button>
      </div>

      <div className="notes-list">
        {notes === null ? (
          <div className="muted small notes-empty">載入中…</div>
        ) : notes.length === 0 ? (
          <div className="muted small notes-empty">
            {scope === "this" ? `${current.name} 還沒有筆記。` : "還沒有筆記，按「＋ 寫筆記」開始。"}
          </div>
        ) : (
          notes.map((n) => (
            <button
              key={`${n.market}:${n.symbol}:${n.date}`}
              className="note-card"
              onClick={() => onOpen(n)}
            >
              <div className="note-meta">
                <span className="cal-date">{n.date}</span>
                <span className="note-sym">{n.name}</span>
                <span className="grow" />
                {n.mood && <span className="tag">{n.mood}</span>}
              </div>
              <div className="note-title">{n.title || "(無標題)"}</div>
              {n.excerpt && <div className="note-excerpt muted">{n.excerpt}</div>}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
