import { describe, expect, it } from 'bun:test';
import {
  mintWsSessionToken,
  verifyWsSessionToken,
} from '../src/services/activity/wsSessionToken';
import { encryptToken } from '../src/utils/crypto';

describe('mintWsSessionToken / verifyWsSessionToken', () => {
  it('round-trips the userId, instanceId, guildId and mode', () => {
    const token = mintWsSessionToken({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
    });
    expect(verifyWsSessionToken(token)).toEqual({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
    });
  });

  it('rejects a tampered token', () => {
    const token = mintWsSessionToken({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
    });
    const tampered = `${token.slice(0, -4)  }abcd`;
    expect(verifyWsSessionToken(tampered)).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = encryptToken(
      JSON.stringify({
        userId: 'user-1',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
      }),
      Date.now() - 1000,
    )!;
    expect(verifyWsSessionToken(expired)).toBeNull();
  });

  it('rejects a payload missing userId/instanceId/guildId/mode', () => {
    const malformed = encryptToken(JSON.stringify({ foo: 'bar' }))!;
    expect(verifyWsSessionToken(malformed)).toBeNull();
  });

  it('rejects a payload with an invalid mode', () => {
    const malformed = encryptToken(
      JSON.stringify({
        userId: 'user-1',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'coop',
      }),
    )!;
    expect(verifyWsSessionToken(malformed)).toBeNull();
  });
});
