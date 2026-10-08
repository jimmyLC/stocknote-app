import { useEffect, useMemo, useRef } from "react";
import {
  init,
  dispose,
  registerOverlay,
  type Chart,
  type DeepPartial,
  type KLineData,
  type Styles,
} from "klinecharts";
import type { Bar } from "../lib/api";
import { MA_PERIODS, MA_COLORS, type Period, type Prefs } from "../lib/prefs";

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

// 有筆記的日子：K 棒下方的小藍點
registerOverlay({
  name: "noteDot",
  totalStep: 2,
  createPointFigures: ({ coordinates }) => [
    {
      type: "circle",
      attrs: { x: coordinates[0].x, y: coordinates[0].y, r: 4 },
      styles: { style: "fill", color: "#4f8cff" },
    },
  ],
});

interface AggBar extends KLineData {
  /** 這根（週／月）包含的交易日 */
  dates: string[];
  volume: number;
  turnover: number;
}

function tsOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function weekStart(date: string): string {
  const d = new Date(tsOf(date));
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** 日 → 週／月聚合（開＝第一筆、高＝最高、低＝最低、收＝最後、量＝成交金額加總）。 */
function aggregate(bars: Bar[], period: Period): AggBar[] {
  if (period === "day") {
    return bars.map((b) => ({
      timestamp: tsOf(b.date),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.turnover,
      turnover: b.turnover,
      dates: [b.date],
    }));
  }
  const groups = new Map<string, AggBar>();
  for (const b of bars) {
    const key = period === "week" ? weekStart(b.date) : b.date.slice(0, 7);
    let g = groups.get(key);
    if (!g) {
      g = {
        timestamp: tsOf(b.date),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: 0,
        turnover: 0,
        dates: [],
      };
      groups.set(key, g);
    }
    g.high = Math.max(g.high, b.high);
    g.low = Math.min(g.low, b.low);
    g.close = b.close;
    g.volume += b.turnover;
    g.turnover += b.turnover;
    g.timestamp = tsOf(b.date); // 以期間最後一個交易日為時間
    g.dates.push(b.date);
  }
  return [...groups.values()].sort((a, b) => a.timestamp - b.timestamp);
}

const PANES: Record<"vol" | "macd" | "kdj", { name: string; paneId: string; calcParams: number[]; shortName?: string; height: number; order: number }> = {
  vol: { name: "VOL", paneId: "volume_pane", calcParams: [5, 20], shortName: "成交金額", height: 100, order: 10 },
  macd: { name: "MACD", paneId: "macd_pane", calcParams: [12, 26, 9], height: 120, order: 20 },
  kdj: { name: "KDJ", paneId: "kdj_pane", calcParams: [9, 3, 3], height: 120, order: 30 },
};

function applyPane(chart: Chart, enabled: boolean, pane: (typeof PANES)["vol"]) {
  chart.removeIndicator({ paneId: pane.paneId });
  if (enabled) {
    chart.createIndicator({
      name: pane.name,
      paneId: pane.paneId,
      calcParams: pane.calcParams,
      ...(pane.shortName ? { shortName: pane.shortName } : {}),
    });
    chart.setPaneOptions({ id: pane.paneId, height: pane.height, order: pane.order });
  }
}

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

  const series = useMemo(() => aggregate(bars, prefs.period), [bars, prefs.period]);
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const noteSetRef = useRef<Set<string>>(new Set());
  noteSetRef.current = new Set(noteDates);
  const pickRef = useRef(onPickDate);
  pickRef.current = onPickDate;

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

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chartRef.current = null;
      dispose(chart);
    };
  }, []);

  // 資料 / 代號 / 週期
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setSymbol({ ticker: symbol, pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({
      span: 1,
      type: prefs.period === "week" ? "week" : prefs.period === "month" ? "month" : "day",
    });
    chart.setDataLoader({
      getBars: ({ callback }) => callback(series, false),
    });
    chart.resetData();
  }, [series, symbol, prefs.period]);

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

  // 點 K 線 → 回報日期（週／月則回報該期間內第一個有筆記的日子，否則期間最後一天）
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (data?: unknown) => {
      const d = data as { timestamp?: number; kLineData?: { timestamp?: number } } | undefined;
      const t = d?.timestamp ?? d?.kLineData?.timestamp;
      if (typeof t !== "number") return;
      const bar = seriesRef.current.find((b) => b.timestamp === t);
      if (!bar) return;
      const note = bar.dates.find((x) => noteSetRef.current.has(x));
      pickRef.current(note ?? bar.dates[bar.dates.length - 1]);
    };
    chart.subscribeAction("onCandleBarClick", handler);
    return () => chart.unsubscribeAction("onCandleBarClick", handler);
  }, []);

  // 有筆記的日子在圖上做記號（週／月：期間內任一天有筆記就標）
  const noteKey = noteDates.join(",");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ name: "noteDot" });
    if (!noteKey) return;
    const set = new Set(noteKey.split(","));
    for (const bar of series) {
      const noteDate = bar.dates.find((x) => set.has(x));
      if (!noteDate) continue;
      chart.createOverlay({
        id: `note-${bar.timestamp}`,
        name: "noteDot",
        paneId: "candle_pane",
        points: [{ timestamp: bar.timestamp, value: bar.low }],
        lock: false,
        onClick: () => pickRef.current(noteDate),
      });
    }
  }, [noteKey, series]);

  // 顯示區間
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const apply = () => {
      const total = series.length;
      if (!total) return;
      const width = chart.getSize()?.width ?? elRef.current?.clientWidth ?? 800;
      const n = prefs.range ?? total;
      chart.setBarSpace(Math.max(0.1, Math.min(50, width / n)));
      chart.scrollToRealTime();
    };
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [prefs.range, series]);

  return <div ref={elRef} className="chart" />;
}
