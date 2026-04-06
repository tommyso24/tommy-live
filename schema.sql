-- schema.sql
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  nickname   TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  parent_id  INTEGER,
  created_at TEXT NOT NULL,
  ip_hash    TEXT,
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments(slug, status);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);

-- 全站用户账户
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname      TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  verified      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
-- 用户资料扩展字段（v2）：avatar_id, bio

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 邮箱验证码
CREATE TABLE IF NOT EXISTS verification_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_vcode_email ON verification_codes(email, used);

-- 游戏排行榜
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  game       TEXT NOT NULL,
  best_time  INTEGER NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_user_game ON scores(user_id, game);
CREATE INDEX IF NOT EXISTS idx_scores_game_time ON scores(game, best_time);

-- 用户资料扩展字段（v2）
ALTER TABLE users ADD COLUMN avatar_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
