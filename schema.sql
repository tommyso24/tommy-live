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
