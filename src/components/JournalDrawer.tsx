import { useEffect, useState } from "react";
import type { Bar, Note, NoteInput } from "../lib/api";

export const MOODS = ["看多", "看空", "中性", "觀望"];

interface Props {
  open: boolean;
  market: string;
  symbol: string;
  name: string;
  date: string | null;
  min: string;
  max: string;
  note: Note | null;
  bar: Bar | null;
  prevClose: number | null;
  onDateChange: (date: string) => void;
  onStep: (delta: number) => void;
  onSave: (input: Omit<NoteInput, "market" | "symbol" | "date">) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function JournalDrawer({
  open,
  symbol,
  name,
  date,
  min,
  max,
  note,
  bar,
  prevClose,
  onDateChange,
  onStep,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [mood, setMood] = useState("");

  useEffect(() => {
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setTagsText((note?.tags ?? []).join("、"));
    setMood(note?.mood ?? "");
  }, [note, date]);

  function save() {
    onSave({
      title,
      body,
      tags: tagsText
        .split(/[、,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      mood,
    });
    onClose();
  }

  // 快捷鍵：⌘/Ctrl+S 儲存、Esc 關閉、←/→ 換日期（在輸入框內不攔 ←/→）
  useEffect(() => {
    if (!open || !date) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        onClose();
      } else if (!typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        onStep(e.key === "ArrowLeft" ? -1 : 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, date, title, body, tagsText, mood, onClose, onStep]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !date) return null;

  const change = bar && prevClose ? bar.close - prevClose : null;
  const pct = change && prevClose ? (change / prevClose) * 100 : null;

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div>
          <div className="drawer-title">交易日誌</div>
          <div className="muted small">
            {name} ({symbol})
          </div>
        </div>
        <button className="ghost" onClick={onClose}>
          關閉
        </button>
      </div>

      <label className="field">
        日期
        <input
          type="date"
          value={date}
          min={min}
          max={max}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
        />
      </label>

      {bar && (
        <div className="day-quote small">
          <span className={change && change > 0 ? "up" : change && change < 0 ? "down" : ""}>
            收 {bar.close.toLocaleString()}
            {change !== null && prevClose !== null && (
              <>
                {" "}
                {change >= 0 ? "▲" : "▼"} {Math.abs(change).toLocaleString()} (
                {pct!.toFixed(2)}%)
              </>
            )}
          </span>
          <span className="muted">
            開 {bar.open.toLocaleString()}　高 {bar.high.toLocaleString()}　低{" "}
            {bar.low.toLocaleString()}
          </span>
        </div>
      )}

      <label className="field">
        標題
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="一句話總結" />
      </label>

      <label className="field grow-field">
        內容
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="想法、計畫、檢討…"
        />
      </label>

      <label className="field">
        標籤（用「、」或逗號分隔）
        <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="突破、量增" />
      </label>

      <div className="field">
        心情
        <div className="mood-row">
          {MOODS.map((m) => (
            <button
              key={m}
              className={`mood${mood === m ? " on" : ""}`}
              onClick={() => setMood(mood === m ? "" : m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-actions">
        <button onClick={save}>儲存</button>
        {note && (
          <button className="ghost danger" onClick={onDelete}>
            刪除
          </button>
        )}
        <span className="grow" />
        <span className="muted small">⌘/Ctrl+S 儲存　←/→ 換日期</span>
      </div>
    </aside>
  );
}
