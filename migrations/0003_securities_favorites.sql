-- 證券主檔（搜尋用）＋使用者收藏清單
create table if not exists securities (
  market text not null,
  symbol text not null,
  name text not null,
  industry text,
  kind text not null, -- 'index' | 'stock' | 'etf'
  updated_at integer not null,
  primary key (market, symbol)
);

create table if not exists favorites (
  id text not null primary key,
  user_id text not null references "user" (id) on delete cascade,
  market text not null,
  symbol text not null,
  sort_order integer not null,
  created_at integer not null,
  unique (user_id, market, symbol)
);

create index if not exists favorites_user_idx on favorites (user_id, sort_order);
create index if not exists securities_name_idx on securities (name);
