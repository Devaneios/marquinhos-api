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

db.run(`
  CREATE TABLE IF NOT EXISTS xp_config (
    event_type  TEXT    NOT NULL PRIMARY KEY,
    xp_amount   INTEGER NOT NULL,
    cooldown_ms INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_levels (
    user_id     TEXT    NOT NULL,
    guild_id    TEXT    NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    xp          INTEGER NOT NULL DEFAULT 0,
    total_xp    INTEGER NOT NULL DEFAULT 0,
    last_xp_gain INTEGER,
    PRIMARY KEY (user_id, guild_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS achievements (
    id          TEXT NOT NULL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    category    TEXT NOT NULL,
    rarity      TEXT NOT NULL CHECK(rarity IN ('common','rare','epic','legendary')),
    icon        TEXT NOT NULL,
    condition   TEXT NOT NULL,
    reward_xp   INTEGER NOT NULL DEFAULT 0
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id        TEXT    NOT NULL,
    guild_id       TEXT    NOT NULL,
    achievement_id TEXT    NOT NULL REFERENCES achievements(id),
    unlocked_at    INTEGER NOT NULL,
    PRIMARY KEY (user_id, guild_id, achievement_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_stats (
    user_id          TEXT    NOT NULL,
    guild_id         TEXT    NOT NULL,
    total_commands   INTEGER NOT NULL DEFAULT 0,
    total_scrobbles  INTEGER NOT NULL DEFAULT 0,
    total_voice_joins INTEGER NOT NULL DEFAULT 0,
    total_games      INTEGER NOT NULL DEFAULT 0,
    games_won        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, guild_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS xp_cooldowns (
    user_id    TEXT    NOT NULL,
    guild_id   TEXT    NOT NULL,
    event_type TEXT    NOT NULL,
    last_gain  INTEGER NOT NULL,
    PRIMARY KEY (user_id, guild_id, event_type)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS game_results (
    id          TEXT    NOT NULL PRIMARY KEY,
    guild_id    TEXT    NOT NULL,
    game_type   TEXT    NOT NULL,
    played_at   INTEGER NOT NULL,
    duration_ms INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_game_results (
    game_result_id TEXT    NOT NULL REFERENCES game_results(id),
    user_id        TEXT    NOT NULL,
    guild_id       TEXT    NOT NULL,
    position       INTEGER NOT NULL,
    xp_awarded     INTEGER NOT NULL,
    PRIMARY KEY (game_result_id, user_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS evolutive_achievements (
    user_id       TEXT    NOT NULL,
    guild_id      TEXT    NOT NULL,
    base_id       TEXT    NOT NULL,
    current_tier  INTEGER NOT NULL DEFAULT 1,
    unlocked_at   INTEGER NOT NULL,
    last_evolved  INTEGER,
    evolution_log TEXT    NOT NULL DEFAULT '[]',
    PRIMARY KEY (user_id, guild_id, base_id)
  )
`);

db.run(
  'CREATE INDEX IF NOT EXISTS idx_user_game_results_user ON user_game_results(user_id, guild_id)',
);
db.run(
  'CREATE INDEX IF NOT EXISTS idx_game_results_guild_type ON game_results(guild_id, game_type)',
);
db.run(
  'CREATE INDEX IF NOT EXISTS idx_user_levels_leaderboard ON user_levels(guild_id, level DESC, total_xp DESC)',
);

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
