import { useEffect, useState } from "react";
import { fetchCalendar, type CalendarNote } from "../lib/api";

interface Props {
  onOpen: (note: CalendarNote) => void;
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

export default function CalendarView({ onOpen, refreshKey }: Props) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState<CalendarNote[]>([]);

  useEffect(() => {
    let alive = true;
    fetchCalendar(month).then((n) => alive && setNotes(n));
    return () => {
      alive = false;
    };
  }, [month, refreshKey]);

  return (
    <div className="calendar">
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
              <span className="cal-sym">
                {n.symbol}
              </span>
              <span className="cal-title">{n.title || "(無標題)"}</span>
              {n.mood && <span className="tag">{n.mood}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
