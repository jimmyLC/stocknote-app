import { useEffect, useRef } from "react";
import { init, dispose, type Chart, type KLineData } from "klinecharts";
import type { Bar } from "../lib/api";
import { MA_PERIODS, MA_COLORS, type Prefs } from "../lib/prefs";

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

interface Pane {
  name: string;
  paneId: string;
  calcParams: number[];
  height: number;
  order: number;
}

const PANES: Record<"vol" | "macd" | "kdj", Pane> = {
  vol: { name: "VOL", paneId: "volume_pane", calcParams: [5, 20], height: 100, order: 10 },
  macd: { name: "MACD", paneId: "macd_pane", calcParams: [12, 26, 9], height: 120, order: 20 },
  kdj: { name: "KDJ", paneId: "kdj_pane", calcParams: [9, 3, 3], height: 120, order: 30 },
};

function applyPane(chart: Chart, enabled: boolean, pane: Pane) {
  chart.removeIndicator({ paneId: pane.paneId });
  if (enabled) {
    chart.createIndicator({ name: pane.name, paneId: pane.paneId, calcParams: pane.calcParams });
    chart.setPaneOptions({ id: pane.paneId, height: pane.height, order: pane.order });
  }
}

/**
 * klinecharts v10：K線 + 均線 + 成交量 + MACD + KD。
 * 外層刻意保持薄，將來換圖表庫只改這裡。
 */
export default function PriceChart({ bars, prefs }: { bars: Bar[]; prefs: Prefs }) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const dataRef = useRef<KLineData[]>([]);

  const maPeriods = MA_PERIODS.filter((p) => prefs.ma[String(p)]);
  const maKey = maPeriods.join(",");

  // 初始化（只做一次）
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const chart: Chart | null = init(el, {
      locale: "zh-CN",
      timezone: "Asia/Taipei",
      layout: {
        barSpaceLimit: { min: 0.1, max: 50 },
        pane: { height: 100, minHeight: 40, dragEnabled: true },
        yAxis: { position: "right", inside: false, scrollZoomEnabled: true },
      },
    });
    if (!chart) return;
    chartRef.current = chart;

    chart.setSymbol({ ticker: "TWII", pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({ span: 1, type: "day" });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chartRef.current = null;
      dispose(chart);
    };
  }, []);

  // 資料
  useEffect(() => {
    dataRef.current = toKLine(bars);
    const chart = chartRef.current;
    if (!chart) return;
    chart.setDataLoader({
      getBars: ({ callback }) => callback(dataRef.current, false),
    });
    chart.resetData();
  }, [bars]);

  // 均線（可逐條開關）
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeIndicator({ paneId: "candle_pane", name: "MA" });
    const periods = maKey ? maKey.split(",").map(Number) : [];
    if (periods.length > 0) {
      chart.createIndicator(
        {
          name: "MA",
          paneId: "candle_pane",
          calcParams: periods,
          styles: { lines: periods.map((p) => ({ color: MA_COLORS[p] })) },
        },
        true,
      );
    }
  }, [maKey]);

  // 三個子面板開關
  useEffect(() => {
    if (chartRef.current) applyPane(chartRef.current, prefs.vol, PANES.vol);
  }, [prefs.vol]);
  useEffect(() => {
    if (chartRef.current) applyPane(chartRef.current, prefs.macd, PANES.macd);
  }, [prefs.macd]);
  useEffect(() => {
    if (chartRef.current) applyPane(chartRef.current, prefs.kdj, PANES.kdj);
  }, [prefs.kdj]);

  // 顯示區間
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const apply = () => {
      const total = dataRef.current.length;
      if (!total) return;
      const width = chart.getSize()?.width ?? elRef.current?.clientWidth ?? 800;
      const n = prefs.range ?? total;
      chart.setBarSpace(Math.max(0.1, Math.min(50, width / n)));
      chart.scrollToRealTime();
    };
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [prefs.range, bars]);

  return <div ref={elRef} className="chart" />;
}
