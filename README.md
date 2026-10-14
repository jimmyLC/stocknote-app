# StockNote

台股**加權指數**技術分析 ＋ **交易日誌**的網頁 App / PWA。

看加權指數日線的 K 線、均線、成交量、MACD、KD，在圖上點某一天寫下自己的交易日誌，另外可以收藏想追蹤的證券。目前先做加權指數，架構保留之後看台股個股、再到美股。

> **狀態：** 已上線 https://stock.example.com，進度見 `PROJECT_STATUS.md`。

## 功能（規劃）

- **日線技術分析**：K 線 ＋ 均線（MA 5/10/20/60/120/240）、成交量（成交金額）、MACD(12/26/9)、KD(9/3/3)；每條均線與各指標面板都可勾選顯示或隱藏。
- **交易日誌**：以「該檔證券 ＋ 交易日」為單位，一天一則、私人；有標題、內容、標籤、心情，並自動帶入當日收盤與漲跌。有筆記的日子會在圖上顯示旗標，日曆頁也看得到。
- **收藏清單**：側邊欄顯示、可拖曳排序。
- **搜尋**：輸入股票代號或名稱自動完成。
- 預設顯示近 1 年，可縮放，快捷 3M / 6M / 1Y / 全部。

## 技術

- 前端：React 19 + TypeScript + Vite（PWA）
- 圖表：klinecharts
- 託管：Cloudflare Workers（靜態資源 + API）
- 後端：Cloudflare Workers Functions ＋ D1 ＋ Cache API
- 登入：Better Auth
- 資料來源：FinMind（主）、臺灣證券交易所官網（備援）

## 開發

```bash
npm install
npm run dev        # 本機開發
npm run build      # 型別檢查 + 打包
npm run deploy     # 打包 + wrangler deploy
```

## 文件

- `AGENTS.md` — 給 AI coding agent 的技術說明與規則
- `PROJECT_STATUS.md` — 專案進度、里程碑、待辦（繁體中文）

## 授權與聲明

個人非商業使用。資料來源：FinMind／臺灣證券交易所。**本工具僅供參考，不構成投資建議。**
