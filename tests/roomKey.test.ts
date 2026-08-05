import { describe, expect, it } from 'bun:test';
import { roomKey } from '../src/services/activity/roomKey';

describe('roomKey', () => {
  it('scopes multi-mode sessions to instance and game, shared across users', () => {
    expect(
      roomKey({
        instanceId: 'inst-1',
        game: 'pong',
        mode: 'multi',
        userId: 'user-1',
      }),
    ).toBe('inst-1:pong:multi');
    expect(
      roomKey({
        instanceId: 'inst-1',
        game: 'pong',
        mode: 'multi',
        userId: 'user-2',
      }),
    ).toBe('inst-1:pong:multi');
  });

  it('scopes single/local mode sessions per user', () => {
    expect(
      roomKey({
        instanceId: 'inst-1',
        game: 'pong',
        mode: 'single',
        userId: 'user-1',
      }),
    ).toBe('inst-1:pong:single:user-1');
    expect(
      roomKey({
        instanceId: 'inst-1',
        game: 'pong',
        mode: 'local',
        userId: 'user-1',
      }),
    ).toBe('inst-1:pong:local:user-1');
  });

  it('scopes by game so one instance can host more than one game', () => {
    expect(
      roomKey({
        instanceId: 'inst-1',
        game: 'wordle',
        mode: 'single',
        userId: 'user-1',
      }),
    ).toBe('inst-1:wordle:single:user-1');
  });
});
