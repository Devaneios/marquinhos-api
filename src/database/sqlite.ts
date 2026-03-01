import { Database } from 'bun:sqlite';

const SQLITE_PATH = process.env.SQLITE_PATH ?? './marquinhos.db';
const TTL_SECONDS = 600;
const CLEANUP_INTERVAL_MS = 60_000;

export const db = new Database(SQLITE_PATH, { create: true });

db.run('PRAGMA journal_mode = WAL');

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id                   TEXT NOT NULL PRIMARY KEY,
    lastfm_session_token TEXT,
    lastfm_username      TEXT,
    scrobbles_on         INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS scrobbles_queue (
    id            TEXT    NOT NULL PRIMARY KEY,
    track         TEXT    NOT NULL,
    playback_data TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  )
`);

const cleanupStmt = db.prepare(
  `DELETE FROM scrobbles_queue WHERE created_at < (unixepoch() - ${TTL_SECONDS})`,
);

setInterval(() => {
  try {
    cleanupStmt.run();
  } catch (err) {
    console.error('SQLite TTL cleanup error:', err);
  }
}, CLEANUP_INTERVAL_MS);

console.log(`SQLite database opened at: ${SQLITE_PATH}`);
