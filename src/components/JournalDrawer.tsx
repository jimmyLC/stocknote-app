import { useEffect, useState } from "react";
import type { Bar, Note, NoteInput } from "../lib/api";

export const MOODS = ["看多", "看空", "中性", "觀望"];

interface Props {
  open: boolean;
  market: string;
  symbol: string;
  name: string;
  date: string | null;
  note: Note | null;
  bar: Bar | null;
  prevClose: number | null;
  onSave: (input: Omit<NoteInput, "market" | "symbol" | "date">) => void;
  onClose: () => void;
}

export default function JournalDrawer({
  open,
  symbol,
  name,
  date,
  note,
  bar,
  prevClose,
  onSave,
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

  if (!open || !date) return null;

  const change = bar && prevClose ? bar.close - prevClose : null;
  const pct = change && prevClose ? (change / prevClose) * 100 : null;

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

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div>
          <div className="drawer-title">交易日誌</div>
          <div className="muted small">
            {name} ({symbol})｜{date}
          </div>
        </div>
        <button className="ghost" onClick={onClose}>
          關閉
        </button>
      </div>

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
        <span className="grow" />
        <span className="muted small">
          {note ? "已有筆記，儲存會覆寫" : "（清空全部欄位並儲存＝刪除）"}
        </span>
      </div>
    </aside>
  );
}
