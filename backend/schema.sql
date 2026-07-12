-- Timetable Schema (synced with SQLAlchemy models)
-- Run: sqlite3 instance/timetable.db < schema.sql

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    theme TEXT DEFAULT 'light',
    telegram_notify BOOLEAN DEFAULT 0,
    telegram_chat_id TEXT DEFAULT '',
    ical_token TEXT DEFAULT '',
    share_token TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bot_state (
    chat_id TEXT PRIMARY KEY,
    welcome_message_id INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#c4956a',
    icon TEXT DEFAULT '📌',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day INTEGER NOT NULL CHECK(day BETWEEN 0 AND 6),
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    category TEXT DEFAULT 'task',
    color TEXT DEFAULT NULL,
    note TEXT DEFAULT '',
    repeat TEXT DEFAULT 'none',
    notify_before INTEGER DEFAULT NULL,
    notified BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_user_day ON events(user_id, day);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
