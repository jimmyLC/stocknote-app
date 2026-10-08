-- 交易日誌：以「該檔證券 ＋ 交易日」為單位，一天一則，私人。
create table if not exists journal_notes (
  id text not null primary key,
  user_id text not null references "user" (id) on delete cascade,
  market text not null,
  symbol text not null,
  trade_date text not null, -- YYYY-MM-DD
  title text not null,
  body text,
  tags text, -- JSON array 字串
  mood text,
  created_at integer not null,
  updated_at integer not null,
  unique (user_id, market, symbol, trade_date)
);

create index if not exists journal_notes_lookup on journal_notes (user_id, market, symbol, trade_date);
create index if not exists journal_notes_month on journal_notes (user_id, trade_date);
