import { useEffect, useState } from "react";
import {
  exportNotes,
  fetchCalendar,
  searchNotes,
  type CalendarNote,
  type NoteSearchResult,
} from "../lib/api";

interface Props {
  onOpen: (note: { date: string; market: string; symbol: string }) => void;
  refreshKey: number;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function download(format: "json" | "csv") {
  const notes = await exportNotes();
  const stamp = new Date().toISOString().slice(0, 10);
  let blob: Blob;
  let filename: string;
  if (format === "json") {
    blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    filename = `stocknote-notes-${stamp}.json`;
  } else {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["date", "market", "symbol", "name", "mood", "tags", "title", "body"];
    const rows = notes.map((n) =>
      [n.date, n.market, n.symbol, n.name, n.mood ?? "", n.tags.join(" "), n.title, n.body ?? ""]
        .map(esc)
        .join(","),
    );
    blob = new Blob(["\uFEFF" + [head.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    filename = `stocknote-notes-${stamp}.csv`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CalendarView({ onOpen, refreshKey }: Props) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSearchResult[]>([]);

  useEffect(() => {
    let alive = true;
    fetchCalendar(month).then((n) => alive && setNotes(n));
    return () => {
      alive = false;
    };
  }, [month, refreshKey]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchNotes(q).then(setResults);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, refreshKey]);

  const searching = query.trim().length > 0;

  return (
    <div className="calendar">
      <div className="calendar-bar">
        <input
          className="calendar-search"
          value={query}
          placeholder="搜尋筆記（標題／內容／標籤）"
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="grow" />
        <button className="ghost" onClick={() => download("json")}>
          匯出 JSON
        </button>
        <button className="ghost" onClick={() => download("csv")}>
          匯出 CSV
        </button>
      </div>

      {searching ? (
        results.length === 0 ? (
          <div className="muted small" style={{ padding: "12px 16px" }}>
            沒有符合的筆記。
          </div>
        ) : (
          <div className="calendar-list">
            {results.map((n) => (
              <div
                key={`${n.market}:${n.symbol}:${n.date}`}
                className="calendar-item"
                onClick={() => onOpen(n)}
              >
                <span className="cal-date">{n.date}</span>
                <span className="cal-sym">{n.symbol}</span>
                <span className="cal-title">{n.title || "(無標題)"}</span>
                {n.mood && <span className="tag">{n.mood}</span>}
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="calendar-bar">
            <button className="ghost" onClick={() => setMonth(shiftMonth(month, -1))}>
              ←
            </button>
            <span className="calendar-month">{monthLabel(month)}</span>
            <button className="ghost" onClick={() => setMonth(shiftMonth(month, 1))}>
              →
            </button>
          </div>
          {notes.length === 0 ? (
            <div className="muted small" style={{ padding: "12px 16px" }}>
              這個月還沒有筆記。
            </div>
          ) : (
            <div className="calendar-list">
              {notes.map((n) => (
                <div
                  key={`${n.market}:${n.symbol}:${n.date}`}
                  className="calendar-item"
                  onClick={() => onOpen(n)}
                >
                  <span className="cal-date">{n.date}</span>
                  <span className="cal-sym">{n.symbol}</span>
                  <span className="cal-title">{n.title || "(無標題)"}</span>
                  {n.mood && <span className="tag">{n.mood}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
