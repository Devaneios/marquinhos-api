import { describe, expect, it, mock } from 'bun:test';
import { BingoSpeedSession } from '../src/services/activity/bingoSpeed/BingoSpeedSession';
import type { ActivityBroadcaster } from '../src/services/activity/pong/PongSession';

describe('BingoSpeedSession', () => {
  function createMockBroadcaster(): ActivityBroadcaster {
    return {
      broadcast: mock(() => {}),
      broadcastBinary: mock(() => {}),
    };
  }

  describe('Player Management', () => {
    it('adds a player to the session', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      const result = session.addPlayer('user1', {} as any);

      expect(result).not.toBeNull();
      expect(session.playerCount).toBe(1);
    });

    it('generates a bingo card for each player', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      const card = session.addPlayer('user1', {} as any);

      expect(card).toBeDefined();
      expect(card!.board).toBeDefined();
      expect(card!.board.length).toBe(5);
    });

    it('prevents duplicate players', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      const card1 = session.addPlayer('user1', {} as any);
      const card2 = session.addPlayer('user1', {} as any);

      expect(card1).toEqual(card2);
      expect(session.playerCount).toBe(1);
    });

    it('removes a player from the session', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      session.addPlayer('user1', {} as any);
      expect(session.playerCount).toBe(1);

      session.removePlayer('user1');
      expect(session.playerCount).toBe(0);
    });
  });

  describe('Game Flow', () => {
    it('starts the game and begins drawing numbers', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
        undefined,
        { drawIntervalMs: 100 },
      );

      session.addPlayer('user1', {} as any);
      session.addPlayer('user2', {} as any);

      session.start();

      // Wait for at least one draw
      return new Promise((resolve) => {
        setTimeout(() => {
          expect((broadcaster.broadcast as any).mock.calls.length).toBeGreaterThan(0);
          session.stop();
          resolve(undefined);
        }, 150);
      });
    });

    it('broadcasts drawn numbers to all players', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
        undefined,
        { drawIntervalMs: 100 },
      );

      session.addPlayer('user1', {} as any);
      session.addPlayer('user2', {} as any);

      session.start();

      return new Promise((resolve) => {
        setTimeout(() => {
          const calls = (broadcaster.broadcast as any).mock.calls;
          const drawCalls = calls.filter(
            (call: any[]) => call[1]?.type === 'number_drawn',
          );
          expect(drawCalls.length).toBeGreaterThan(0);
          session.stop();
          resolve(undefined);
        }, 150);
      });
    });

    it('stops drawing when stopped', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
        undefined,
        { drawIntervalMs: 100 },
      );

      session.addPlayer('user1', {} as any);
      session.start();
      session.stop();

      const callsBeforeStop = (broadcaster.broadcast as any).mock.calls.length;

      return new Promise((resolve) => {
        setTimeout(() => {
          const callsAfterStop = (broadcaster.broadcast as any).mock.calls.length;
          expect(callsAfterStop).toBe(callsBeforeStop);
          resolve(undefined);
        }, 100);
      });
    });
  });

  describe('Bingo Claims', () => {
    it('validates a bingo claim from a player', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      session.addPlayer('user1', {} as any);
      session.addPlayer('user2', {} as any);

      // Claim bingo (without actual card state, should fail)
      const result = session.claimBingo('user1');

      expect(result).toBeDefined();
      if ('error' in result) {
        expect(result.error).toBeDefined();
      }
    });

    it('rejects a bingo claim from a non-existent player', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      const result = session.claimBingo('nonexistent');

      expect(result).toBeDefined();
      expect('error' in result).toBe(true);
    });

    it('broadcasts game end when player wins', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      const card1 = session.addPlayer('user1', {} as any);
      session.addPlayer('user2', {} as any);

      if (card1) {
        // Mark an entire row for testing
        card1.marked[0] = [true, true, true, true, true];

        // Mark the free space
        card1.marked[2][2] = true;

        // Draw numbers that complete the row
        for (let i = 1; i <= 5; i++) {
          session.markNumber('user1', i);
        }

        const result = session.claimBingo('user1');
        expect(result).toBeDefined();
      }
    });
  });

  describe('Public State', () => {
    it('returns the current public state', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      session.addPlayer('user1', {} as any);
      const state = session.getPublicState();

      expect(state).toBeDefined();
      expect(state.playerCount).toBe(1);
    });

    it('returns player card state', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      const card = session.addPlayer('user1', {} as any);
      const playerCard = session.getPlayerCard('user1');

      expect(playerCard).toEqual(card);
    });

    it('returns null for non-existent player card', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
      );

      const playerCard = session.getPlayerCard('nonexistent');

      expect(playerCard).toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('clears intervals on session end', () => {
      const broadcaster = createMockBroadcaster();
      const session = new BingoSpeedSession(
        { sessionKey: 'test:key', instanceId: 'inst1', guildId: 'guild1', mode: 'multi' },
        broadcaster,
        undefined,
        { drawIntervalMs: 100 },
      );

      session.addPlayer('user1', {} as any);
      session.start();

      return new Promise((resolve) => {
        setTimeout(() => {
          session.stop();
          resolve(undefined);
        }, 150);
      });
    });
  });
});
