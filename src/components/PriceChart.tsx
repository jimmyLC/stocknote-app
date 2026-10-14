import { useEffect, useMemo, useRef } from "react";
import {
  init,
  dispose,
  registerLocale,
  registerOverlay,
  type Chart,
  type DeepPartial,
  type KLineData,
  type Styles,
} from "klinecharts";
import type { Bar } from "../lib/api";
import { MA_PERIODS, MA_COLORS, type Period, type Prefs } from "../lib/prefs";

// 台股慣例：紅漲綠跌（與標題列一致）。淺色／深色各一組，跟 style.css 的色票對齊。
const PALETTE = {
  dark: {
    up: "#f0534f",
    down: "#2bbf86",
    upSoft: "rgba(240, 83, 79, 0.7)",
    downSoft: "rgba(43, 191, 134, 0.7)",
    grid: "rgba(255, 255, 255, 0.05)",
    axis: "#262c3a",
    text: "#8c95a6",
    legend: "#c9cfdb",
    crosshair: "#5d6678",
    crossBg: "#2a3142",
  },
  light: {
    up: "#d93025",
    down: "#0e8a5f",
    upSoft: "rgba(217, 48, 37, 0.6)",
    downSoft: "rgba(14, 138, 95, 0.6)",
    grid: "rgba(16, 24, 40, 0.06)",
    axis: "#dde1e8",
    text: "#5d6573",
    legend: "#2b313c",
    crosshair: "#8a93a3",
    crossBg: "#3a4150",
  },
};

export type Theme = keyof typeof PALETTE;

function chartStyles(theme: Theme): DeepPartial<Styles> {
  const c = PALETTE[theme];
  return {
    grid: {
      show: true,
      horizontal: { show: true, size: 1, color: c.grid, style: "dashed", dashedValue: [2, 2] },
      vertical: { show: true, size: 1, color: c.grid, style: "dashed", dashedValue: [2, 2] },
    },
    candle: {
      bar: {
        upColor: c.up,
        downColor: c.down,
        upBorderColor: c.up,
        downBorderColor: c.down,
        upWickColor: c.up,
        downWickColor: c.down,
      },
      priceMark: {
        high: { color: c.text },
        low: { color: c.text },
        last: { upColor: c.up, downColor: c.down },
      },
      tooltip: { title: { color: c.text }, legend: { color: c.legend } },
    },
    indicator: {
      bars: [{ upColor: c.upSoft, downColor: c.downSoft }],
      tooltip: { title: { color: c.text }, legend: { color: c.legend } },
    },
    xAxis: { axisLine: { color: c.axis }, tickLine: { color: c.axis }, tickText: { color: c.text } },
    yAxis: { axisLine: { color: c.axis }, tickLine: { color: c.axis }, tickText: { color: c.text } },
    separator: { color: c.axis },
    crosshair: {
      horizontal: { line: { color: c.crosshair }, text: { backgroundColor: c.crossBg, borderColor: c.crossBg } },
      vertical: { line: { color: c.crosshair }, text: { backgroundColor: c.crossBg, borderColor: c.crossBg } },
    },
  };
}

// 圖上資訊列用繁體中文（klinecharts 內建只有簡體）
registerLocale("zh-TW", {
  time: "時間：",
  open: "開：",
  high: "高：",
  low: "低：",
  close: "收：",
  volume: "成交量：",
  change: "漲幅：",
  turnover: "成交額：",
  second: "秒",
  minute: "分",
  hour: "時",
  day: "天",
  week: "週",
  month: "月",
  year: "年",
});

// 有筆記的日子：K 棒下方的小藍點
registerOverlay({
  name: "noteDot",
  totalStep: 2,
  // 可點擊但不要被拖動（覆寫預設拖曳行為）
  performEventPressedMove: () => {},
  createPointFigures: ({ coordinates }) => [
    {
      type: "circle",
      attrs: { x: coordinates[0].x, y: coordinates[0].y, r: 4 },
      styles: { style: "fill", color: "#4f8cff" },
    },
  ],
});

// 交易計畫的進場／停損／停利水平線（整條橫跨，左側標文字）
export interface PriceLine {
  value: number;
  label: string;
  color: string;
}

registerOverlay<PriceLine>({
  name: "tradeLine",
  totalStep: 2,
  lock: true,
  needDefaultPointFigure: false,
  performEventPressedMove: () => {},
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    const y = coordinates[0]?.y;
    const d = overlay.extendData;
    if (y == null || !d) return [];
    return [
      {
        type: "line",
        attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
        styles: { style: "dashed", dashedValue: [6, 4], color: d.color, size: 1 },
        ignoreEvent: true,
      },
      {
        type: "text",
        // 標在右側（左上角是 K 線的資訊列，會重疊）
        attrs: {
          x: bounding.width - 8,
          y: y - 3,
          text: `${d.label} ${d.value.toLocaleString()}`,
          align: "right",
          baseline: "bottom",
        },
        styles: { color: d.color, size: 11, backgroundColor: "transparent", paddingLeft: 0, paddingRight: 0 },
        ignoreEvent: true,
      },
    ];
  },
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

const PANES: Record<"vol" | "macd" | "kdj", { name: string; paneId: string; calcParams: number[]; shortName?: string; height: number; order: number }> = {  vol: { name: "VOL", paneId: "volume_pane", calcParams: [5, 20], shortName: "成交金額", height: 100, order: 10 },
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
  resetKey,
  volumeLabel,
  priceLines = [],
  theme = "dark",
  onPickDate,
}: {
  bars: Bar[];
  prefs: Prefs;
  symbol: string;
  noteDates: string[];
  resetKey: number;
  /** 台股＝成交金額；國外指數只有成交量 */
  volumeLabel: string;
  priceLines?: PriceLine[];
  theme?: Theme;
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

  const themeRef = useRef(theme);
  themeRef.current = theme;
  useEffect(() => {
    chartRef.current?.setStyles(chartStyles(theme));
  }, [theme]);

  const maPeriods = MA_PERIODS.filter((p) => prefs.ma[String(p)]);
  const maKey = maPeriods.join(",");

  // 初始化（只做一次）
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const chart: Chart | null = init(el, {
      locale: "zh-TW",
      timezone: "Asia/Taipei",
      styles: chartStyles(themeRef.current),
      layout: {
        barSpaceLimit: { min: 0.1, max: 150 },
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
    if (chartRef.current)
      applyPane(chartRef.current, prefs.vol, { ...PANES.vol, shortName: volumeLabel });
  }, [prefs.vol, volumeLabel]);
  useEffect(() => {
    if (chartRef.current) applyPane(chartRef.current, prefs.macd, PANES.macd);
  }, [prefs.macd]);
  useEffect(() => {
    if (chartRef.current) applyPane(chartRef.current, prefs.kdj, PANES.kdj);
  }, [prefs.kdj]);

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

  // 交易計畫的價位線
  const lineKey = JSON.stringify(priceLines);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ name: "tradeLine" });
    const last = series.at(-1);
    if (!last) return;
    for (const line of JSON.parse(lineKey) as PriceLine[]) {
      chart.createOverlay({
        name: "tradeLine",
        paneId: "candle_pane",
        points: [{ timestamp: last.timestamp, value: line.value }],
        extendData: line,
      });
    }
  }, [lineKey, series]);

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
  }, [prefs.range, series, resetKey]);

  return (
    <div ref={elRef} className="chart" tabIndex={0} aria-label="價格圖" />
  );
}
