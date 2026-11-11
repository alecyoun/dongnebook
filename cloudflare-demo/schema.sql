CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '역삼동',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  description TEXT,
  image_url TEXT,
  region TEXT NOT NULL DEFAULT '역삼동',
  status TEXT NOT NULL DEFAULT '판매중',
  seller_id INTEGER REFERENCES users(id),
  bumped_at DATETIME,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_products_region ON products(region);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,
  payment_key TEXT,
  product_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME
);
-- AI 기능 하루 사용량(사이트 전체 'all', 접속자별 'ip:…')
CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);
