import { db } from '../database/sqlite';
import { EvolutiveAchievementsService } from './evolutiveAchievements';

const evolutiveService = new EvolutiveAchievementsService();

interface XpConfig {
  event_type: string;
  xp_amount: number;
  cooldown_ms: number | null;
}

export interface UserLevel {
  user_id: string;
  guild_id: string;
  level: number;
  xp: number;
  total_xp: number;
  last_xp_gain: number | null;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: string;
  condition: string;
  reward_xp: number;
}

export interface UserAchievement {
  user_id: string;
  guild_id: string;
  achievement_id: string;
  unlocked_at: number;
  name: string;
  description: string;
  category: string;
  rarity: string;
  icon: string;
  reward_xp: number;
}

interface UserStats {
  user_id: string;
  guild_id: string;
  total_commands: number;
  total_scrobbles: number;
  total_voice_joins: number;
  total_games: number;
  games_won: number;
}

export interface AddXpResult {
  userLevel: UserLevel;
  onCooldown: boolean;
  leveledUp: boolean;
  newLevel?: number;
  unlockedAchievements: string[];
}

export interface GameResultInput {
  sessionId: string;
  guildId: string;
  gameType: string;
  durationMs?: number;
  results: { userId: string; position: number }[];
}

const DEFAULT_XP_CONFIG = [
  { event_type: 'command', xp_amount: 5, cooldown_ms: 60_000 },
  { event_type: 'voice_join', xp_amount: 2, cooldown_ms: 300_000 },
  { event_type: 'scrobble', xp_amount: 3, cooldown_ms: 60_000 },
  { event_type: 'achievement', xp_amount: 50, cooldown_ms: null },
  { event_type: 'game_win', xp_amount: 20, cooldown_ms: null },
  { event_type: 'game_participate', xp_amount: 5, cooldown_ms: null },
];

const DEFAULT_ACHIEVEMENTS = [
  {
    id: 'first_command',
    name: 'Primeiro Passo',
    description: 'Execute seu primeiro comando',
    category: 'commands',
    rarity: 'common',
    icon: '👋',
    condition: { type: 'commands', threshold: 1 },
    reward_xp: 10,
  },
  {
    id: 'commands_10',
    name: 'Iniciante',
    description: 'Execute 10 comandos',
    category: 'commands',
    rarity: 'common',
    icon: '⚡',
    condition: { type: 'commands', threshold: 10 },
    reward_xp: 50,
  },
  {
    id: 'commands_100',
    name: 'Veterano',
    description: 'Execute 100 comandos',
    category: 'commands',
    rarity: 'rare',
    icon: '🏆',
    condition: { type: 'commands', threshold: 100 },
    reward_xp: 200,
  },
  {
    id: 'level_10',
    name: 'Escalador',
    description: 'Alcance o nível 10',
    category: 'levels',
    rarity: 'rare',
    icon: '🧗',
    condition: { type: 'level', threshold: 10 },
    reward_xp: 500,
  },
  {
    id: 'music_lover',
    name: 'Amante da Música',
    description: 'Registre 50 scrobbles',
    category: 'music',
    rarity: 'epic',
    icon: '🎵',
    condition: { type: 'scrobbles', threshold: 50 },
    reward_xp: 300,
  },
  {
    id: 'scrobbles_100',
    name: 'DJ Marquinhos',
    description: 'Registre 100 scrobbles',
    category: 'music',
    rarity: 'epic',
    icon: '📊',
    condition: { type: 'scrobbles', threshold: 100 },
    reward_xp: 400,
  },
];

export class GamificationService {
  private getRequiredXP(level: number): number {
    return Math.floor(Math.pow(level, 2) * 100);
  }

  initializeDefaults(): void {
    const configCount = db
      .query<{ count: number }, []>('SELECT COUNT(*) as count FROM xp_config')
      .get();
    if (!configCount || configCount.count === 0) {
      const insertConfig = db.prepare(
        'INSERT OR IGNORE INTO xp_config (event_type, xp_amount, cooldown_ms) VALUES ($event_type, $xp_amount, $cooldown_ms)',
      );
      for (const c of DEFAULT_XP_CONFIG) {
        insertConfig.run({
          $event_type: c.event_type,
          $xp_amount: c.xp_amount,
          $cooldown_ms: c.cooldown_ms,
        });
      }
      console.log('XP config seeded');
    }

    const achievCount = db
      .query<
        { count: number },
        []
      >('SELECT COUNT(*) as count FROM achievements')
      .get();
    if (!achievCount || achievCount.count === 0) {
      const insertAchiev = db.prepare(
        'INSERT OR IGNORE INTO achievements (id, name, description, category, rarity, icon, condition, reward_xp) VALUES ($id, $name, $description, $category, $rarity, $icon, $condition, $reward_xp)',
      );
      for (const a of DEFAULT_ACHIEVEMENTS) {
        insertAchiev.run({
          $id: a.id,
          $name: a.name,
          $description: a.description,
          $category: a.category,
          $rarity: a.rarity,
          $icon: a.icon,
          $condition: JSON.stringify(a.condition),
          $reward_xp: a.reward_xp,
        });
      }
      console.log('Default achievements seeded');
    }
  }

  getXpConfig(): XpConfig[] {
    return db.query<XpConfig, []>('SELECT * FROM xp_config').all();
  }

  private ensureUser(userId: string, guildId: string): void {
    db.query(
      'INSERT OR IGNORE INTO user_levels (user_id, guild_id) VALUES ($userId, $guildId)',
    ).run({
      $userId: userId,
      $guildId: guildId,
    });
    db.query(
      'INSERT OR IGNORE INTO user_stats (user_id, guild_id) VALUES ($userId, $guildId)',
    ).run({
      $userId: userId,
      $guildId: guildId,
    });
  }

  getUserLevel(userId: string, guildId: string): UserLevel {
    this.ensureUser(userId, guildId);
    return db
      .query<
        UserLevel,
        { $userId: string; $guildId: string }
      >('SELECT * FROM user_levels WHERE user_id = $userId AND guild_id = $guildId')
      .get({ $userId: userId, $guildId: guildId })!;
  }

  private applyLevelUps(userId: string, guildId: string): boolean {
    let leveled = false;
    let row = db
      .query<
        UserLevel,
        { $userId: string; $guildId: string }
      >('SELECT * FROM user_levels WHERE user_id = $userId AND guild_id = $guildId')
      .get({ $userId: userId, $guildId: guildId })!;

    while (row.xp >= this.getRequiredXP(row.level)) {
      const required = this.getRequiredXP(row.level);
      db.query(
        'UPDATE user_levels SET level = level + 1, xp = xp - $required WHERE user_id = $userId AND guild_id = $guildId',
      ).run({ $required: required, $userId: userId, $guildId: guildId });
      row = db
        .query<
          UserLevel,
          { $userId: string; $guildId: string }
        >('SELECT * FROM user_levels WHERE user_id = $userId AND guild_id = $guildId')
        .get({ $userId: userId, $guildId: guildId })!;
      leveled = true;
    }
    return leveled;
  }

  addXP(userId: string, guildId: string, eventType: string): AddXpResult {
    this.ensureUser(userId, guildId);

    const config = db
      .query<
        XpConfig,
        { $eventType: string }
      >('SELECT * FROM xp_config WHERE event_type = $eventType')
      .get({ $eventType: eventType });

    if (!config) throw new Error(`Unknown event type: ${eventType}`);

    // Cooldown check
    if (config.cooldown_ms !== null) {
      const cooldown = db
        .query<
          { last_gain: number },
          { $userId: string; $guildId: string; $eventType: string }
        >('SELECT last_gain FROM xp_cooldowns WHERE user_id = $userId AND guild_id = $guildId AND event_type = $eventType')
        .get({ $userId: userId, $guildId: guildId, $eventType: eventType });

      if (cooldown && Date.now() - cooldown.last_gain < config.cooldown_ms) {
        return {
          userLevel: this.getUserLevel(userId, guildId),
          onCooldown: true,
          leveledUp: false,
          unlockedAchievements: [],
        };
      }

      db.query(
        'INSERT INTO xp_cooldowns (user_id, guild_id, event_type, last_gain) VALUES ($userId, $guildId, $eventType, $now) ON CONFLICT (user_id, guild_id, event_type) DO UPDATE SET last_gain = excluded.last_gain',
      ).run({
        $userId: userId,
        $guildId: guildId,
        $eventType: eventType,
        $now: Date.now(),
      });
    }

    // Update activity counters
    if (eventType === 'command') {
      db.query(
        'UPDATE user_stats SET total_commands = total_commands + 1 WHERE user_id = $userId AND guild_id = $guildId',
      ).run({ $userId: userId, $guildId: guildId });
    } else if (eventType === 'scrobble') {
      db.query(
        'UPDATE user_stats SET total_scrobbles = total_scrobbles + 1 WHERE user_id = $userId AND guild_id = $guildId',
      ).run({ $userId: userId, $guildId: guildId });
    } else if (eventType === 'voice_join') {
      db.query(
        'UPDATE user_stats SET total_voice_joins = total_voice_joins + 1 WHERE user_id = $userId AND guild_id = $guildId',
      ).run({ $userId: userId, $guildId: guildId });
    }

    // Apply XP
    db.query(
      'UPDATE user_levels SET xp = xp + $amount, total_xp = total_xp + $amount, last_xp_gain = $now WHERE user_id = $userId AND guild_id = $guildId',
    ).run({
      $amount: config.xp_amount,
      $now: Date.now(),
      $userId: userId,
      $guildId: guildId,
    });

    const leveledUp = this.applyLevelUps(userId, guildId);
    const userLevel = this.getUserLevel(userId, guildId);
    const unlockedAchievements = this.checkAndAwardAchievements(
      userId,
      guildId,
    );
    evolutiveService.checkAndEvolveAll(userId, guildId);

    return {
      userLevel,
      onCooldown: false,
      leveledUp,
      newLevel: leveledUp ? userLevel.level : undefined,
      unlockedAchievements,
    };
  }

  checkAndAwardAchievements(userId: string, guildId: string): string[] {
    const stats = db
      .query<
        UserStats,
        { $userId: string; $guildId: string }
      >('SELECT * FROM user_stats WHERE user_id = $userId AND guild_id = $guildId')
      .get({ $userId: userId, $guildId: guildId });

    const userLevel = db
      .query<
        UserLevel,
        { $userId: string; $guildId: string }
      >('SELECT * FROM user_levels WHERE user_id = $userId AND guild_id = $guildId')
      .get({ $userId: userId, $guildId: guildId });

    if (!stats || !userLevel) return [];

    const achievements = db
      .query<Achievement, []>('SELECT * FROM achievements')
      .all();
    const unlocked: string[] = [];

    for (const achievement of achievements) {
      const existing = db
        .query<
          { n: number },
          { $userId: string; $guildId: string; $id: string }
        >('SELECT 1 as n FROM user_achievements WHERE user_id = $userId AND guild_id = $guildId AND achievement_id = $id')
        .get({ $userId: userId, $guildId: guildId, $id: achievement.id });

      if (existing) continue;

      const condition = JSON.parse(achievement.condition) as {
        type: string;
        threshold: number;
      };
      let met = false;

      switch (condition.type) {
        case 'commands':
          met = stats.total_commands >= condition.threshold;
          break;
        case 'scrobbles':
          met = stats.total_scrobbles >= condition.threshold;
          break;
        case 'level':
          met = userLevel.level >= condition.threshold;
          break;
        case 'games_won':
          met = stats.games_won >= condition.threshold;
          break;
        case 'total_games':
          met = stats.total_games >= condition.threshold;
          break;
      }

      if (met) {
        this.unlockAchievement(userId, guildId, achievement.id);
        unlocked.push(achievement.id);
      }
    }

    return unlocked;
  }

  unlockAchievement(
    userId: string,
    guildId: string,
    achievementId: string,
  ): boolean {
    this.ensureUser(userId, guildId);

    const achievement = db
      .query<
        Achievement,
        { $id: string }
      >('SELECT * FROM achievements WHERE id = $id')
      .get({ $id: achievementId });

    if (!achievement) return false;

    const existing = db
      .query<
        { n: number },
        { $userId: string; $guildId: string; $achievementId: string }
      >('SELECT 1 as n FROM user_achievements WHERE user_id = $userId AND guild_id = $guildId AND achievement_id = $achievementId')
      .get({
        $userId: userId,
        $guildId: guildId,
        $achievementId: achievementId,
      });

    if (existing) return false;

    db.query(
      'INSERT INTO user_achievements (user_id, guild_id, achievement_id, unlocked_at) VALUES ($userId, $guildId, $achievementId, $now)',
    ).run({
      $userId: userId,
      $guildId: guildId,
      $achievementId: achievementId,
      $now: Date.now(),
    });

    if (achievement.reward_xp > 0) {
      db.query(
        'UPDATE user_levels SET xp = xp + $amount, total_xp = total_xp + $amount WHERE user_id = $userId AND guild_id = $guildId',
      ).run({
        $amount: achievement.reward_xp,
        $userId: userId,
        $guildId: guildId,
      });
      this.applyLevelUps(userId, guildId);
    }

    return true;
  }

  getUserAchievements(userId: string, guildId: string): UserAchievement[] {
    return db
      .query<UserAchievement, { $userId: string; $guildId: string }>(
        `SELECT ua.user_id, ua.guild_id, ua.achievement_id, ua.unlocked_at,
                a.name, a.description, a.category, a.rarity, a.icon, a.reward_xp
         FROM user_achievements ua
         JOIN achievements a ON a.id = ua.achievement_id
         WHERE ua.user_id = $userId AND ua.guild_id = $guildId
         ORDER BY ua.unlocked_at DESC`,
      )
      .all({ $userId: userId, $guildId: guildId });
  }

  getAllAchievements(): Achievement[] {
    return db
      .query<Achievement, []>('SELECT * FROM achievements ORDER BY rarity, id')
      .all();
  }

  createAchievement(data: {
    id: string;
    name: string;
    description: string;
    category: string;
    rarity: string;
    icon: string;
    condition: object;
    reward_xp: number;
  }): Achievement {
    db.query(
      'INSERT INTO achievements (id, name, description, category, rarity, icon, condition, reward_xp) VALUES ($id, $name, $description, $category, $rarity, $icon, $condition, $reward_xp)',
    ).run({
      $id: data.id,
      $name: data.name,
      $description: data.description,
      $category: data.category,
      $rarity: data.rarity,
      $icon: data.icon,
      $condition: JSON.stringify(data.condition),
      $reward_xp: data.reward_xp,
    });
    return db
      .query<
        Achievement,
        { $id: string }
      >('SELECT * FROM achievements WHERE id = $id')
      .get({ $id: data.id })!;
  }

  getLeaderboard(guildId: string, limit: number = 10): UserLevel[] {
    return db
      .query<
        UserLevel,
        { $guildId: string; $limit: number }
      >('SELECT * FROM user_levels WHERE guild_id = $guildId ORDER BY level DESC, total_xp DESC LIMIT $limit')
      .all({ $guildId: guildId, $limit: limit });
  }

  recordGameResult(input: GameResultInput): void {
    const now = Date.now();

    const winXp = (
      db
        .query<
          { xp_amount: number },
          { $event: string }
        >('SELECT xp_amount FROM xp_config WHERE event_type = $event')
        .get({ $event: 'game_win' }) ?? { xp_amount: 20 }
    ).xp_amount;

    const participateXp = (
      db
        .query<
          { xp_amount: number },
          { $event: string }
        >('SELECT xp_amount FROM xp_config WHERE event_type = $event')
        .get({ $event: 'game_participate' }) ?? { xp_amount: 5 }
    ).xp_amount;

    db.query(
      'INSERT OR IGNORE INTO game_results (id, guild_id, game_type, played_at, duration_ms) VALUES ($id, $guildId, $gameType, $playedAt, $durationMs)',
    ).run({
      $id: input.sessionId,
      $guildId: input.guildId,
      $gameType: input.gameType,
      $playedAt: now,
      $durationMs: input.durationMs ?? null,
    });

    for (const player of input.results) {
      this.ensureUser(player.userId, input.guildId);
      const xpAwarded = player.position === 1 ? winXp : participateXp;

      db.query(
        'INSERT OR IGNORE INTO user_game_results (game_result_id, user_id, guild_id, position, xp_awarded) VALUES ($gameId, $userId, $guildId, $position, $xpAwarded)',
      ).run({
        $gameId: input.sessionId,
        $userId: player.userId,
        $guildId: input.guildId,
        $position: player.position,
        $xpAwarded: xpAwarded,
      });

      db.query(
        'UPDATE user_levels SET xp = xp + $amount, total_xp = total_xp + $amount, last_xp_gain = $now WHERE user_id = $userId AND guild_id = $guildId',
      ).run({
        $amount: xpAwarded,
        $now: now,
        $userId: player.userId,
        $guildId: input.guildId,
      });

      db.query(
        'UPDATE user_stats SET total_games = total_games + 1, games_won = games_won + $wonIncrement WHERE user_id = $userId AND guild_id = $guildId',
      ).run({
        $wonIncrement: player.position === 1 ? 1 : 0,
        $userId: player.userId,
        $guildId: input.guildId,
      });

      this.applyLevelUps(player.userId, input.guildId);
      this.checkAndAwardAchievements(player.userId, input.guildId);
    }
  }

  getUserGameStats(
    userId: string,
    guildId: string,
  ): {
    stats: UserStats;
    byGame: { game_type: string; games_played: number; wins: number }[];
  } {
    this.ensureUser(userId, guildId);

    const stats = db
      .query<
        UserStats,
        { $userId: string; $guildId: string }
      >('SELECT * FROM user_stats WHERE user_id = $userId AND guild_id = $guildId')
      .get({ $userId: userId, $guildId: guildId })!;

    const byGame = db
      .query<
        { game_type: string; games_played: number; wins: number },
        { $userId: string; $guildId: string }
      >(
        `SELECT gr.game_type,
                COUNT(*) as games_played,
                SUM(CASE WHEN ugr.position = 1 THEN 1 ELSE 0 END) as wins
         FROM user_game_results ugr
         JOIN game_results gr ON gr.id = ugr.game_result_id
         WHERE ugr.user_id = $userId AND ugr.guild_id = $guildId
         GROUP BY gr.game_type
         ORDER BY games_played DESC`,
      )
      .all({ $userId: userId, $guildId: guildId });

    return { stats, byGame };
  }

  getGameLeaderboard(
    guildId: string,
    gameType: string,
  ): {
    user_id: string;
    wins: number;
    games_played: number;
    total_xp_earned: number;
  }[] {
    return db
      .query<
        {
          user_id: string;
          wins: number;
          games_played: number;
          total_xp_earned: number;
        },
        { $guildId: string; $gameType: string }
      >(
        `SELECT ugr.user_id,
                COUNT(*) as games_played,
                SUM(CASE WHEN ugr.position = 1 THEN 1 ELSE 0 END) as wins,
                SUM(ugr.xp_awarded) as total_xp_earned
         FROM user_game_results ugr
         JOIN game_results gr ON gr.id = ugr.game_result_id
         WHERE ugr.guild_id = $guildId AND gr.game_type = $gameType
         GROUP BY ugr.user_id
         ORDER BY wins DESC, total_xp_earned DESC
         LIMIT 25`,
      )
      .all({ $guildId: guildId, $gameType: gameType });
  }
}
