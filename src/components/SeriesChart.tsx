import { useEffect, useMemo, useRef, useState } from "react";

// 輕量 SVG 圖（市場數據頁用），不依賴 klinecharts。
// kind="bar"：正負長條（買賣超）；kind="line"：折線。可選疊一條右軸的加權指數。

export interface Point {
  date: string;
  value: number;
}

interface Props {
  data: Point[];
  kind: "bar" | "line";
  format: (v: number) => string;
  /** 疊在右軸的參考線（例如加權指數） */
  overlay?: { label: string; data: Point[] };
  /** 水平參考線（例如維持率 130%、160%） */
  refLines?: Array<{ value: number; label: string; tone: "danger" | "warn" }>;
  height?: number;
}

const PAD = { top: 12, right: 52, bottom: 22, left: 56 };

export default function SeriesChart({ data, kind, format, overlay, refLines = [], height = 220 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  const H = height;

  // 用實際寬度當座標系，文字才不會被拉伸
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data.length === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const geo = useMemo(() => {
    const values = data.map((d) => d.value).concat(refLines.map((r) => r.value));
    let min = Math.min(...values, kind === "bar" ? 0 : Infinity);
    let max = Math.max(...values, kind === "bar" ? 0 : -Infinity);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    if (kind === "line") {
      min -= span * 0.06;
      max += span * 0.06;
    }
    const x = (i: number) => PAD.left + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = (v: number) => PAD.top + ((max - v) / (max - min)) * ih;

    const overlayMap = new Map((overlay?.data ?? []).map((p) => [p.date, p.value]));
    const ov = data.map((d) => overlayMap.get(d.date));
    const ovVals = ov.filter((v): v is number => v != null);
    const oMin = Math.min(...ovVals);
    const oMax = Math.max(...ovVals);
    const oy = (v: number) =>
      PAD.top + (oMax === oMin ? ih / 2 : ((oMax - v) / (oMax - oMin)) * ih * 0.9 + ih * 0.05);

    const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
    return { x, y, ov, oy, ticks, hasOverlay: ovVals.length > 1 };
  }, [data, kind, overlay, refLines, iw, ih]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data.length === 0) {
    return (
      <div ref={boxRef} className="series-empty muted small">
        沒有資料
      </div>
    );
  }

  const barW = Math.max(1, (iw / data.length) * 0.7);
  const linePath = data.map((d, i) => `${i ? "L" : "M"}${geo.x(i)},${geo.y(d.value)}`).join("");
  const ovPath = geo.ov
    .map((v, i) => (v == null ? null : `${geo.x(i)},${geo.oy(v)}`))
    .filter(Boolean)
    .map((p, i) => `${i ? "L" : "M"}${p}`)
    .join("");

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / iw) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  }

  const h = hover != null ? data[hover] : null;
  const hOv = hover != null ? geo.ov[hover] : undefined;
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div ref={boxRef} className="series-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ height: H }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
      >
        {geo.ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} />
            <text className="axis" x={PAD.left - 6} y={geo.y(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} className="axis" x={geo.x(i)} y={H - 6} textAnchor="middle">
              {d.date.slice(2, 7).replace("-", "/")}
            </text>
          ) : null,
        )}
        {refLines.map((r) => (
          <g key={r.label}>
            <line className={`ref ${r.tone}`} x1={PAD.left} x2={W - PAD.right} y1={geo.y(r.value)} y2={geo.y(r.value)} />
            <text className={`ref-label ${r.tone}`} x={W - PAD.right - 4} y={geo.y(r.value) - 4} textAnchor="end">
              {r.label}
            </text>
          </g>
        ))}
        {geo.hasOverlay && <path className="overlay-line" d={ovPath} />}
        {kind === "bar"
          ? data.map((d, i) => (
              <rect
                key={d.date}
                className={d.value >= 0 ? "bar up" : "bar down"}
                x={geo.x(i) - barW / 2}
                width={barW}
                y={Math.min(geo.y(d.value), geo.y(0))}
                height={Math.max(0.5, Math.abs(geo.y(d.value) - geo.y(0)))}
              />
            ))
          : <path className="main-line" d={linePath} />}
        {hover != null && (
          <line className="cursor" x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={H - PAD.bottom} />
        )}
      </svg>
      <div className="series-legend small">
        {h ? (
          <>
            <span className="muted">{h.date}</span>
            <span className={kind === "bar" ? (h.value >= 0 ? "up" : "down") : ""}>{format(h.value)}</span>
            {overlay && hOv != null && (
              <span className="muted">
                {overlay.label} {hOv.toLocaleString()}
              </span>
            )}
          </>
        ) : (
          <span className="muted">
            滑過圖表看每日數值{overlay ? `｜灰線＝${overlay.label}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
