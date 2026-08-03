import { describe, expect, it } from 'bun:test';
import ActivityController from '../src/controllers/activity.controller';
import { verifyWsSessionToken } from '../src/services/activity/wsSessionToken';
import type { DiscordService } from '../src/services/discord';

function makeReq(body: Record<string, unknown>) {
  return { body } as any;
}

function makeRes() {
  let statusCode: number | undefined;
  let payload: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      payload = data;
      return res;
    },
    getStatus: () => statusCode,
    getPayload: () => payload,
  };
  return res;
}

describe('ActivityController.exchangeToken', () => {
  it('returns 200 with the access token from DiscordService', async () => {
    const fakeService = {
      exchangeActivityCode: async () => ({
        access_token: 'tok_abc',
        token_type: 'Bearer',
        expires_in: 604800,
        scope: 'identify',
      }),
    } as unknown as DiscordService;
    const controller = new ActivityController(fakeService);

    const req = makeReq({ code: 'auth-code-abc' });
    const res = makeRes();

    await controller.exchangeToken(req, res as any);

    expect(res.getStatus()).toBe(200);
    expect(res.getPayload()).toEqual({ data: { access_token: 'tok_abc' } });
  });

  it('returns 500 when DiscordService throws', async () => {
    const fakeService = {
      exchangeActivityCode: async () => {
        throw new Error('discord down');
      },
    } as unknown as DiscordService;
    const controller = new ActivityController(fakeService);

    const req = makeReq({ code: 'auth-code-abc' });
    const res = makeRes();

    await controller.exchangeToken(req, res as any);

    expect(res.getStatus()).toBe(500);
  });
});

describe('ActivityController.getWsSessionToken', () => {
  it('mints a WS session token bound to the resolved Discord user and instance', async () => {
    const fakeService = {
      getDiscordUser: async () => ({ id: 'user-1' }),
    } as unknown as DiscordService;
    const controller = new ActivityController(fakeService);

    const req = makeReq({
      accessToken: 'tok_abc',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'single',
      game: 'pong',
    });
    const res = makeRes();

    await controller.getWsSessionToken(req, res as any);

    expect(res.getStatus()).toBe(200);
    const payload = res.getPayload() as { data: { token: string } };
    expect(verifyWsSessionToken(payload.data.token)).toEqual({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'single',
      game: 'pong',
    });
  });

  it('includes an optional difficulty in the minted token', async () => {
    const fakeService = {
      getDiscordUser: async () => ({ id: 'user-1' }),
    } as unknown as DiscordService;
    const controller = new ActivityController(fakeService);

    const req = makeReq({
      accessToken: 'tok_abc',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'single',
      game: 'pong',
      difficulty: 'easy',
    });
    const res = makeRes();

    await controller.getWsSessionToken(req, res as any);

    const payload = res.getPayload() as { data: { token: string } };
    expect(verifyWsSessionToken(payload.data.token)).toEqual({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'single',
      game: 'pong',
      difficulty: 'easy',
    });
  });

  it('returns 401 when the access token does not resolve to a Discord user', async () => {
    const fakeService = {
      getDiscordUser: async () => ({}),
    } as unknown as DiscordService;
    const controller = new ActivityController(fakeService);

    const req = makeReq({
      accessToken: 'bad-token',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
    });
    const res = makeRes();

    await controller.getWsSessionToken(req, res as any);

    expect(res.getStatus()).toBe(401);
  });

  it('returns 500 when DiscordService throws', async () => {
    const fakeService = {
      getDiscordUser: async () => {
        throw new Error('discord down');
      },
    } as unknown as DiscordService;
    const controller = new ActivityController(fakeService);

    const req = makeReq({
      accessToken: 'tok_abc',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
    });
    const res = makeRes();

    await controller.getWsSessionToken(req, res as any);

    expect(res.getStatus()).toBe(500);
  });
});
