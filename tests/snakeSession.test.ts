import { describe, expect, it } from 'bun:test';
import {
  SnakeSession,
  type SnakeSessionIdentity,
} from '../src/services/activity/snake-game/SnakeSession';

const MOCK_IDENTITY: SnakeSessionIdentity = {
  sessionKey: 'test:snake-game:multi:user1',
  instanceId: 'inst1',
  guildId: 'guild1',
  mode: 'multi',
};

class MockBroadcaster {
  messages: Array<{ key: string; message: any }> = [];
  binaryMessages: Array<{ key: string; data: ArrayBuffer }> = [];

  broadcast(key: string, message: any) {
    this.messages.push({ key, message });
  }

  broadcastBinary(key: string, data: ArrayBuffer) {
    this.binaryMessages.push({ key, data });
  }
}

describe('SnakeSession', () => {
  it('initializes empty with no players', () => {
    const broadcaster = new MockBroadcaster();
    const session = new SnakeSession(MOCK_IDENTITY, broadcaster as any);

    expect(session.playerCount).toBe(0);
  });

  it('adds a player and assigns them player ID', () => {
    const broadcaster = new MockBroadcaster();
    const session = new SnakeSession(MOCK_IDENTITY, broadcaster as any);

    const id = session.addPlayer('user1', {});

    expect(id).toBeDefined();
    expect(session.playerCount).toBe(1);
  });

  it('limits to 2 players in multi mode', () => {
    const broadcaster = new MockBroadcaster();
    const session = new SnakeSession(MOCK_IDENTITY, broadcaster as any);

    session.addPlayer('user1', {});
    session.addPlayer('user2', {});
    const third = session.addPlayer('user3', {});

    expect(third).toBeNull();
    expect(session.playerCount).toBe(2);
  });

  it('returns public config with grid dimensions', () => {
    const broadcaster = new MockBroadcaster();
    const session = new SnakeSession(MOCK_IDENTITY, broadcaster as any);

    const config = session.getPublicConfig();

    expect(config.width).toBe(20);
    expect(config.height).toBe(20);
  });

  it('handles player input and updates direction', () => {
    const broadcaster = new MockBroadcaster();
    const session = new SnakeSession(MOCK_IDENTITY, broadcaster as any);

    session.addPlayer('user1', {});
    session.handleInput('user1', 'up');

    expect(session.playerCount).toBe(1);
  });

  it('detaches player on leave', () => {
    const broadcaster = new MockBroadcaster();
    const session = new SnakeSession(MOCK_IDENTITY, broadcaster as any);

    const connection = {};
    session.addPlayer('user1', connection);
    session.leave('user1', connection);

    expect(session.playerCount).toBe(0);
  });

  it('starts game loop when second player joins in multi mode', (done) => {
    const broadcaster = new MockBroadcaster();
    const session = new SnakeSession(MOCK_IDENTITY, broadcaster as any);

    session.addPlayer('user1', {});
    session.addPlayer('user2', {});

    setTimeout(() => {
      expect(broadcaster.binaryMessages.length).toBeGreaterThan(0);
      session.stop();
      done();
    }, 200);
  });
});
