import { describe, expect, it } from 'bun:test';
import {
  WordChainSession,
  type ActivityBroadcaster,
} from '../src/services/activity/word-chain/WordChainSession';

type BroadcastMessage = { type: string; payload?: unknown };

describe('WordChainSession', () => {
  it('initializes with no players', () => {
    const broadcaster: ActivityBroadcaster = {
      broadcast: () => undefined,
      broadcastBinary: () => undefined,
    };

    const session = new WordChainSession(
      {
        sessionKey: 'test:word-chain:multi',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
      },
      broadcaster,
    );

    expect(session.playerCount).toBe(0);
    expect(session.state.gameOver).toBe(false);
  });

  it('adds a player to the session', () => {
    const broadcaster: ActivityBroadcaster = {
      broadcast: () => undefined,
      broadcastBinary: () => undefined,
    };

    const session = new WordChainSession(
      {
        sessionKey: 'test:word-chain:multi',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
      },
      broadcaster,
    );

    const result = session.addPlayer('user-1', {});
    expect(result).toBe(true);
    expect(session.playerCount).toBe(1);
  });

  it('broadcasts state after player joins', () => {
    const messages: BroadcastMessage[] = [];
    const broadcaster: ActivityBroadcaster = {
      broadcast: (_key, message) => messages.push(message),
      broadcastBinary: () => undefined,
    };

    const session = new WordChainSession(
      {
        sessionKey: 'test:word-chain:multi',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
      },
      broadcaster,
    );

    session.addPlayer('user-1', {});

    expect(messages.length).toBeGreaterThan(0);
    const stateMsg = messages.find((m) => m.type === 'state');
    expect(stateMsg).toBeDefined();
  });

  it('handles word submission through engine', () => {
    type WordChainStatePayload = { currentWord: string; currentTurn: string };
    const captured: { state: WordChainStatePayload | null } = { state: null };
    const broadcaster: ActivityBroadcaster = {
      broadcast: (_key, message) => {
        if (message.type === 'state')
          captured.state = message.payload as WordChainStatePayload;
      },
      broadcastBinary: () => undefined,
    };

    const session = new WordChainSession(
      {
        sessionKey: 'test:word-chain:multi',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
      },
      broadcaster,
    );

    session.addPlayer('user-1', {});
    session.addPlayer('user-2', {});

    session.handleWordSubmission('user-1', 'abelha');

    expect(captured.state?.currentWord).toBe('abelha');
    expect(captured.state?.currentTurn).toBe('user-2');
  });

  it('broadcasts error when word submission invalid', () => {
    const messages: BroadcastMessage[] = [];
    const broadcaster: ActivityBroadcaster = {
      broadcast: (_key, message) => messages.push(message),
      broadcastBinary: () => undefined,
    };

    const session = new WordChainSession(
      {
        sessionKey: 'test:word-chain:multi',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
      },
      broadcaster,
    );

    session.addPlayer('user-1', {});
    session.addPlayer('user-2', {});

    session.handleWordSubmission('user-1', 'abelha');
    session.handleWordSubmission('user-2', 'abelha');

    const errorMsg = messages.find((m) => m.type === 'word_rejected');
    expect(errorMsg).toBeDefined();
  });
});
