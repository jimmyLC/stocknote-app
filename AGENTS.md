# AGENTS.md — stocknote-app（台股技術分析＋交易日誌）

Guide for AI coding agents (Codex, Claude Code) working in this repository. `進度.md` (Traditional Chinese) is the owner-facing status and backlog; if the docs and the code ever disagree, trust the code and fix the docs.

## What this is
**stocknote-app** is a personal Taiwan-stock web app / PWA. It shows the **Taiwan Stock Exchange Weighted Index (加權指數, `TW:0000`)** with a daily technical-analysis chart (candlesticks + moving averages + volume + MACD + KD), keeps a **private trading journal** (one note per security per trading day), and manages a **favorites** list. It is built to grow from the index to individual Taiwan stocks, and later to US stocks (V2/V3).

- **Personal, non-commercial, login-gated.** Not open to the public for now; every route requires sign-in. Non-commercial only (this is what the FinMind free tier allows).
- **Cloudflare-first:** a single **Cloudflare Worker** serving the built static PWA **and** the `/api/*` routes (Workers static assets + `run_worker_first: ["/api/*"]`), backed by **Cloudflare D1** + Cache API.
- Planned URL: https://stock.example.com (Cloudflare Pages custom domain; the zone `example.com` is already on Cloudflare).
- Repo: github.com/jimmyLC/stocknote-app (private), branch `main`.
- **Status: M1–M2 done — live at https://stock.example.com (login + 加權指數 daily chart with MA/VOL/MACD/KD).** See `進度.md` for milestones.

## Working with the owner (Jimmy)
- Jimmy writes **Traditional Chinese (Taiwan)** and is **non-technical about infrastructure**. Answer in Traditional Chinese, explain choices plainly, and say what you verified and what you did **not**.
- **Ask before** account-level or security changes: Cloudflare DNS / Pages / D1 creation, GitHub, billing, secrets, accepting any terms, publishing anything. **Never read, type or paste secrets** — Jimmy enters API keys himself.
- Never state prices, limits or API facts from memory; check the official source first. Report failures faithfully; a feature is "verified" only if you saw it work.
- Do not delete data or force-push. **`git push` to `main` deploys the site** (see Deploying); only push when the change is meant to go live.

## Commands
```bash
npm install
npm run dev        # Vite SPA on :5173 (proxies /api -> :8787)
npm run dev:api    # wrangler dev (Worker + local D1) on :8787 — run alongside `npm run dev`
npm run typecheck  # tsc -p tsconfig.json && tsc -p tsconfig.worker.json
npm run build      # typecheck + vite build   (CI runs exactly this)
npm run deploy     # build + wrangler deploy
npm run db:local   # wrangler d1 migrations apply stocknote-db --local
npm run db:remote  # wrangler d1 migrations apply stocknote-db --remote
```
Local secrets live in `.dev.vars` (git-ignored; copy from `.dev.vars.example`): `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `BETTER_AUTH_URL=http://localhost:5173`. Add `ALLOW_SIGNUP=1` to temporarily re-open sign-up for local testing (production leaves it unset = closed). Note `wrangler dev` uses the `routes` host `stock.example.com` as the local Host, so `worker/auth.ts` lists the dev origins in `trustedOrigins` as well.

## Architecture (decided)
Vite + React 19 + TypeScript PWA (`vite-plugin-pwa`). All UI text is hard-coded **Traditional Chinese**. The browser only ever calls our own `/api/*`; the Worker is the only thing that talks to upstream data providers.

| Area | Choice |
|---|---|
| Frontend | React 19 + TS + Vite + `vite-plugin-pwa` |
| Chart | **klinecharts 10.0.3** behind a thin `ChartAdapter` (isolates the dependency — klinecharts is a one-maintainer project) |
| Host | Cloudflare **Workers (static assets)**, custom domain `stock.example.com` |
| API | same Worker, `/api/*` (`run_worker_first: ["/api/*"]`) |
| DB | Cloudflare **D1** (SQLite) |
| Auth | **Better Auth** (D1-native, runs on the edge) |
| Client cache | **Dexie** (IndexedDB) |
| Server cache | **Cache API** |

### Data providers
- One canonical identity model: `market:symbol` → `TW:0000` (index), `TW:2330`, later `US:AAPL`.
- Provider interface — adapters are the **only** place that know upstream quirks:
  `supports(security)`, `mapSymbol(security)`, `getDailyOHLCV(security, from, to)`.
- **FinMind is primary** (`TaiwanStockPrice` / `USStockPrice`: free, keyless, CORS `*`, history to 1994/1999). The **TWSE official website** (`www.twse.com.tw`) is the fallback for the Taiwan index/stocks only.
- Field mapping: FinMind `max`→high, `min`→low; `Trading_Volume` = shares (股), `Trading_money` = NTD (元).
- Security master list: FinMind `TaiwanStockInfo` (~3,150 codes with name/industry/market), ingested into D1 daily; the index is a synthetic entry (it is not in that list).
- **Prices are unadjusted** in v1 (FinMind's adjusted dataset is paid). The UI labels this 「未還原」. The price index itself is unaffected (no dividend adjustment for the index).

### Product rules (decided; do not change without asking)
- Scope v1: **加權指數 `TW:0000`, daily bars only, ~10 years** of history. No intraday / weekly / monthly.
- Indicators: MA **5/10/20/60/120/240** (each individually toggleable), MACD **12/26/9**, KD **9/3/3**, volume panel (with 5/20 volume MAs). The MACD panel, KD panel and volume panel are each toggleable. Toggles persist per user.
- Volume metric shown: **成交金額 (NTD)**.
- Journal: **one note per (user, security, trade_date)**, **private**. Fields: title, body, tags (free text), mood (fixed: 看多 / 看空 / 中性 / 觀望). The day's close and change are auto-filled. Entry: click a daily candle → right drawer. Notes appear as flags on the chart and on a calendar page.
- Favorites: per user, D1-backed, sidebar list, drag to reorder.
- Auth: the **whole site** is login-gated; still model rows with `user_id` even though v1 is single-user.
- Cadence: update **once per trading day after ~17:30** (TW market closes 13:30; data settles later). Never display real-time data.
- Caching: `/api/ohlcv` cached in the Worker (Cache API) until the next close; client caches in Dexie so the chart works offline. Notes require a connection (read-only offline with a banner); **no offline write queue**.
- Layout: left sidebar (search + favorites) · main (header + 4-pane chart) · journal right drawer; plus a separate calendar page.
- Chart window defaults to **1 year**; zoom/pan; quick ranges **3M / 6M / 1Y / 全部**.
- Footer: 「資料僅供參考，非投資建議」 + 「資料來源：FinMind／臺灣證券交易所」.

## Backend (Cloudflare D1)
```
user / session / account      (created by Better Auth)
securities    (market, symbol, name, industry, kind, updated_at)
favorites     (id, user_id, market, symbol, sort_order, created_at)
journal_notes (id, user_id, market, symbol, trade_date, title, body, tags, mood, created_at, updated_at)
              UNIQUE (user_id, market, symbol, trade_date)
user_prefs    (user_id, prefs_json)
```
API:
```
/api/auth/*                                       Better Auth
GET  /api/me
GET  /api/securities?q=                           code/name autocomplete
GET  /api/ohlcv?market=&symbol=&from=&to=
GET  /api/favorites    POST /api/favorites    DELETE /api/favorites/:id    PATCH /api/favorites/order
GET  /api/notes?market=&symbol=&from=&to=
GET  /api/notes/:date   PUT /api/notes/:date        (upsert; one per day)
GET  /api/notes/calendar?month=
```
Every `/api/*` route except `/api/auth/*` and `/api/health` requires a session (checked in `worker/index.ts`). `GET /api/ohlcv?market=&symbol=&from=&to=` is cached via the Cache API (24 h) and falls back FinMind → TWSE.

Secrets / vars: `BETTER_AUTH_SECRET` (Worker secret), `BETTER_AUTH_URL` (plain `var` in `wrangler.jsonc`), `FINMIND_TOKEN` (optional Worker secret; raises FinMind's free limit 300 → 600 req/hr). Never print secrets.

## Deploying
- **Site:** push to `main` → GitHub Actions builds and runs `npx wrangler deploy` (~30 s; needs the repo secret `CLOUDFLARE_API_TOKEN`). Check with `gh run list -R jimmyLC/stocknote-app -L1`.
- **D1 migrations:** `npx wrangler d1 migrations apply stocknote-db --remote` (also run automatically in CI before deploy).
- **One-time bootstrap** (account-level; do only with Jimmy's approval):
  1. `npx wrangler d1 create stocknote-db` → paste the returned `database_id` into `wrangler.jsonc` (currently `REPLACE_WITH_D1_DATABASE_ID`).
  2. `npx wrangler secret put BETTER_AUTH_SECRET` (≥ 32 chars).
  3. `npx wrangler deploy` — creates the Worker and, via `routes: [{ pattern: "stock.example.com", custom_domain: true }]`, the DNS record + certificate automatically.
  4. Add the repo secret `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit + Workers Routes:Edit + D1:Edit + Zone:Read) so CI can deploy.
- `BETTER_AUTH_URL` is a plain `var` in `wrangler.jsonc` (`https://stock.example.com`); `.dev.vars` overrides it locally.

## Conventions
- Match the surrounding code: small modules, comments only where the "why" is not obvious, no new dependency without a reason.
- Type-check with `npx tsc -b`. For UI changes, check the screen in the local preview (mobile width, light and dark) and say honestly what could not be checked.
- Keep the provider adapters isolated: nothing outside an adapter may know FinMind's `max`/`min` naming, ROC dates, or share-vs-lot units.
- Keep the `ChartAdapter` boundary thin so klinecharts can be swapped for `lightweight-charts` without touching feature code.

## Known risks / open items
- klinecharts is effectively a **one-maintainer** project → pin `10.0.3`, keep the `ChartAdapter` boundary, be ready to swap for `lightweight-charts`.
- FinMind free tier: 300 req/hr anonymous, 600 with a free token, **non-commercial**; do not display real-time data or mirror raw data. Cache aggressively.
- Individual-stock prices are **unadjusted** → labelled in the UI.
- `openapi.twse.com.tw` is **not** usable (no CORS header, and only the last 5 trading days). Use the TWSE **website** `www.twse.com.tw` instead.
- The TWSE fallback paths were validated against the live field shapes (ROC dates, comma numbers, OHLC in `MI_5MINS_HIST`, volume/turnover in `FMTQIK`) but have **not** been exercised end-to-end (FinMind has always answered first).
- `worker/auth.ts` opens sign-up only when `ALLOW_SIGNUP=1` (local dev); production is closed (single user).
- Quarterly-triggering note: the FinMind token, if added, must be a Worker secret and never sent to the browser.
