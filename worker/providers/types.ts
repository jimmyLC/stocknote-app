export interface Bar {
  /** YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 成交股數 (shares) */
  volume: number;
  /** 成交金額 (NTD) */
  turnover: number;
}

export interface Security {
  /** "TW" | "US" */
  market: string;
  /** display code, e.g. "0000" (index), "2330", "AAPL" */
  symbol: string;
}

export interface MarketDataProvider {
  id: string;
  supports(security: Security): boolean;
  getDailyOHLCV(
    security: Security,
    from: string,
    to: string,
    opts?: { token?: string },
  ): Promise<Bar[]>;
}
