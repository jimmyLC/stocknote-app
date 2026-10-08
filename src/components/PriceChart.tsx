import { useEffect, useRef } from "react";
import {
  init,
  dispose,
  type Chart,
  type DeepPartial,
  type KLineData,
  type Styles,
} from "klinecharts";
import type { Bar } from "../lib/api";
import { MA_PERIODS, MA_COLORS, type Prefs } from "../lib/prefs";

// 台股慣例：紅漲綠跌（與標題列一致）。
const UP = "#ef5350";
const DOWN = "#26c281";
const UP_SOFT = "rgba(239, 83, 80, 0.7)";
const DOWN_SOFT = "rgba(38, 194, 129, 0.7)";
// 格線調淡（klinecharts 預設是 #EDEDED，在深色底上太亮）。
const GRID = "rgba(255, 255, 255, 0.05)";
const AXIS = "#26262c";

// 深色主題，接近 klinecharts 官網 demo 的質感。
const CHART_STYLES: DeepPartial<Styles> = {
  grid: {
    show: true,
    horizontal: { show: true, size: 1, color: GRID, style: "dashed", dashedValue: [2, 2] },
    vertical: { show: true, size: 1, color: GRID, style: "dashed", dashedValue: [2, 2] },
  },
  candle: {
    bar: {
      upColor: UP,
      downColor: DOWN,
      upBorderColor: UP,
      downBorderColor: DOWN,
      upWickColor: UP,
      downWickColor: DOWN,
    },
    priceMark: {
      high: { color: "#8b8f96" },
      low: { color: "#8b8f96" },
      last: { upColor: UP, downColor: DOWN },
    },
    tooltip: {
      title: { color: "#9aa0a6" },
      legend: { color: "#c9ccd1" },
    },
  },
  indicator: {
    bars: [{ upColor: UP_SOFT, downColor: DOWN_SOFT }],
    tooltip: {
      title: { color: "#9aa0a6" },
      legend: { color: "#c9ccd1" },
    },
  },
  xAxis: {
    axisLine: { color: AXIS },
    tickLine: { color: AXIS },
    tickText: { color: "#9aa0a6" },
  },
  yAxis: {
    axisLine: { color: AXIS },
    tickLine: { color: AXIS },
    tickText: { color: "#9aa0a6" },
  },
  separator: { color: AXIS },
  crosshair: {
    horizontal: {
      line: { color: "#6b7280" },
      text: { backgroundColor: "#3a3a42", borderColor: "#3a3a42" },
    },
    vertical: {
      line: { color: "#6b7280" },
      text: { backgroundColor: "#3a3a42", borderColor: "#3a3a42" },
    },
  },
};

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
export default function PriceChart({
  bars,
  prefs,
  symbol,
  noteDates,
  onPickDate,
}: {
  bars: Bar[];
  prefs: Prefs;
  symbol: string;
  noteDates: string[];
  onPickDate: (date: string) => void;
}) {
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
      styles: CHART_STYLES,
      layout: {
        barSpaceLimit: { min: 0.1, max: 50 },
        pane: { height: 100, minHeight: 40, dragEnabled: true },
        yAxis: { position: "right", inside: false, scrollZoomEnabled: true },
      },
    });
    if (!chart) return;
    chartRef.current = chart;

    chart.setPeriod({ span: 1, type: "day" });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chartRef.current = null;
      dispose(chart);
    };
  }, []);

  // 資料 / 代號
  useEffect(() => {
    dataRef.current = toKLine(bars);
    const chart = chartRef.current;
    if (!chart) return;
    chart.setSymbol({ ticker: symbol, pricePrecision: 2, volumePrecision: 0 });
    chart.setDataLoader({
      getBars: ({ callback }) => callback(dataRef.current, false),
    });
    chart.resetData();
  }, [bars, symbol]);

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

  // 點 K 線 → 回報該日日期（開日誌抽屜）
  const pickRef = useRef(onPickDate);
  pickRef.current = onPickDate;
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (data?: unknown) => {
      const d = data as { timestamp?: number; kLineData?: { timestamp?: number } } | undefined;
      const ts = d?.timestamp ?? d?.kLineData?.timestamp;
      if (typeof ts !== "number") return;
      pickRef.current(new Date(ts).toISOString().slice(0, 10));
    };
    chart.subscribeAction("onCandleBarClick", handler);
    return () => chart.unsubscribeAction("onCandleBarClick", handler);
  }, []);

  // 有筆記的日子在圖上做記號
  const noteKey = noteDates.join(",");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ name: "simpleAnnotation" });
    if (!noteKey) return;
    const byDate = new Map(bars.map((b) => [b.date, b]));
    for (const date of noteKey.split(",")) {
      const bar = byDate.get(date);
      if (!bar) continue;
      const [y, m, d] = date.split("-").map(Number);
      chart.createOverlay({
        id: `note-${date}`,
        name: "simpleAnnotation",
        paneId: "candle_pane",
        points: [{ timestamp: Date.UTC(y, m - 1, d), value: bar.high }],
        extendData: "📝",
        lock: true,
        styles: {
          line: { color: "#4f8cff", style: "dashed" },
          polygon: { color: "#4f8cff" },
          text: { color: "#4f8cff", size: 12 },
        },
      });
    }
  }, [noteKey, bars]);

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
