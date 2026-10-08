-- 使用者偏好（指標顯示開關、預設區間）
create table if not exists user_prefs (
  user_id text not null primary key references "user" (id) on delete cascade,
  prefs_json text not null,
  updated_at integer not null
);
