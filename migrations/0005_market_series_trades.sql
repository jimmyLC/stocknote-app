-- 市場數據：自己計算、需要長期保存的序列（例如融資維持率估算）。
-- value 為 null 代表那天查過但沒有資料（休市），避免重複去抓。
create table if not exists market_series (
  series text not null,
  date text not null, -- YYYY-MM-DD
  value real,
  updated_at integer not null,
  primary key (series, date)
);

-- 交易計畫：進場前寫好停損／停利，出場後檢討。
create table if not exists trades (
  id text not null primary key,
  user_id text not null references "user" (id) on delete cascade,
  market text not null,
  symbol text not null,
  side text not null default 'long',       -- 'long' | 'short'
  status text not null default 'plan',     -- 'plan' 計畫中 | 'open' 持有中 | 'closed' 已出場 | 'cancelled' 取消
  strategy text,                           -- 策略／型態，例如「突破」「拉回月線」
  reason text,                             -- 進場理由
  plan_date text not null,                 -- 建立計畫的日期 YYYY-MM-DD
  entry_date text,
  entry_price real not null,               -- 計畫或實際進場價
  shares integer not null,                 -- 股數（1 張 = 1000 股）
  stop_price real not null,
  target_price real,
  exit_date text,
  exit_price real,
  exit_note text,
  followed_plan integer,                   -- 1 依計畫出場 / 0 違反計畫 / null 未填
  created_at integer not null,
  updated_at integer not null
);

create index if not exists trades_user_status on trades (user_id, status, plan_date);
