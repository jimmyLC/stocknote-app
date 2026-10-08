import { useEffect, useRef } from "react";
import { init, dispose, type Chart, type KLineData } from "klinecharts";
import type { Bar } from "../lib/api";

// 均線顏色（沿用看盤習慣）
const MA_COLORS = ["#4286F5", "#FEBD09", "#E65596", "#83BF0A", "#834BEB", "#FC7742"];

function toKLine(bars: Bar[]): KLineData[] {
  return bars.map((b) => {
    const [y, m, d] = b.date.split("-").map(Number);
    return {
      timestamp: Date.UTC(y, m - 1, d),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      // 依設計：圖上的「量」用成交金額（NTD），以 VOL 面板呈現。
      volume: b.turnover,
      turnover: b.turnover,
    };
  });
}

/**
 * klinecharts v10：K線 + 均線(MA5/10/20/60/120/240) + 成交量 + MACD + KD(KDJ)。
 * 外層刻意保持薄，將來換圖表庫只改這裡。
 */
export default function PriceChart({ bars }: { bars: Bar[] }) {
  const elRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<KLineData[]>([]);
  dataRef.current = toKLine(bars);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const chart: Chart | null = init(el, {
      locale: "zh-CN",
      timezone: "Asia/Taipei",
      layout: {
        barSpaceLimit: { min: 1, max: 50 },
        pane: { height: 100, minHeight: 40, dragEnabled: true },
        yAxis: { position: "right", inside: false, scrollZoomEnabled: true },
      },
    });
    if (!chart) return;

    chart.setSymbol({ ticker: "TWII", pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({ span: 1, type: "day" });
    chart.setDataLoader({
      getBars: ({ callback }) => callback(dataRef.current, false),
    });

    // 均線疊在 K 線面板上（6 條）
    chart.createIndicator(
      {
        name: "MA",
        paneId: "candle_pane",
        calcParams: [5, 10, 20, 60, 120, 240],
        styles: { lines: MA_COLORS.map((color) => ({ color })) },
      },
      true,
    );

    // 成交量（成交金額）／MACD／KD 各自一個面板
    chart.createIndicator({ name: "VOL", paneId: "volume_pane", calcParams: [5, 20] });
    chart.createIndicator({ name: "MACD", paneId: "macd_pane", calcParams: [12, 26, 9] });
    chart.createIndicator({ name: "KDJ", paneId: "kdj_pane", calcParams: [9, 3, 3] });
    chart.setPaneOptions({ id: "volume_pane", height: 100, order: 10 });
    chart.setPaneOptions({ id: "macd_pane", height: 120, order: 20 });
    chart.setPaneOptions({ id: "kdj_pane", height: 120, order: 30 });

    // 預設顯示最後約 1 年（約 250 根）
    const applyDefaultRange = () => {
      const size = chart.getSize();
      const width = size?.width ?? el.clientWidth ?? 800;
      chart.setBarSpace(width / 250);
      chart.scrollToRealTime();
    };
    requestAnimationFrame(applyDefaultRange);

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      dispose(chart);
    };
  }, []);

  return <div ref={elRef} className="chart" />;
}
