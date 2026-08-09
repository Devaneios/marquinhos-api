import axios from 'axios';
import { URLSearchParams } from 'url';
// URLSearchParams is available globally in Node.js >= 15 but we import for clarity

export interface DiscordUser {
  id: string;
  highestRole?: string;
  [key: string]: unknown;
}

interface DiscordGuildMember {
  roles: string[];
  [key: string]: unknown;
}

export interface ActivityTokenExchangeResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export function buildActivityTokenExchangeBody(code: string): URLSearchParams {
  return new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? '',
    client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
    grant_type: 'authorization_code',
    code,
  });
}

export class DiscordService {
  getDiscordUser = async (token: string): Promise<DiscordUser> => {
    if (
      process.env.NODE_ENV !== 'production' &&
      token === 'mock-access-token'
    ) {
      // Must match @discord/embedded-app-sdk's DiscordSDKMock, which always
      // resolves `user.id` to this literal client-side — any other value
      // here desyncs `identity.userId` from the userId the server embeds
      // in broadcasts, silently breaking every "is this me" comparison in
      // local dev (discovered via WordleRaceGame's per-player guess merge
      // never matching).
      return {
        id: 'mock_user_id',
        username: 'mock_user_username',
        discriminator: '1234',
        avatar: 'mock_user_avatar_hash',
      } as DiscordUser;
    }

    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = (await response.json()) as DiscordUser;

    return data;
  };

  // Client-supplied guildId can't be trusted on its own (it's a plain iframe
  // URL param the SDK relays, not something Discord binds to the access
  // token), so callers who need to act on a specific guild must confirm the
  // token's user is actually a member of it. Uses the bot token, like
  // getDiscordGuildUserHighestRole, since the user's own token is only
  // granted the `identify` scope and can't query guild membership itself.
  isGuildMember = async (guildId: string, userId: string): Promise<boolean> => {
    try {
      const response = await axios.get(
        `https://discord.com/api/guilds/${guildId}/members/${userId}`,
        {
          headers: {
            'User-Agent': 'DiscordBot',
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          },
          validateStatus: (status) =>
            status === 200 || status === 403 || status === 404,
        },
      );
      return response.status === 200;
    } catch (error) {
      // Never let the raw error escape: axios attaches the full request
      // config to it, headers (including the bot token) and all, and
      // callers log caught errors wholesale.
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      // eslint-disable-next-line preserve-caught-error -- cause would leak the bot token via error.config.headers
      throw new Error(
        `Discord guild membership check failed${status ? ` (status ${status})` : ''}`,
      );
    }
  };

  getDiscordGuildUserHighestRole = async (token: string) => {
    const guildUserResponse = await fetch(
      'https://discord.com/api/users/@me/guilds/305861924648779779/member',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const guildUser = (await guildUserResponse.json()) as DiscordGuildMember;

    const guildRolesResponse = await axios.get(
      `https://discord.com/api/guilds/305861924648779779/roles`,
      {
        headers: {
          'User-Agent': 'DiscordBot',
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      },
    );

    const guildRoles = guildRolesResponse?.data as Array<{
      id: string;
      position: number;
      name: string;
    }>;

    let highestRole: { id: string; position: number; name: string } | null =
      null;

    for (const role of guildRoles) {
      if (guildUser?.roles.includes(role.id)) {
        if (!highestRole) {
          highestRole = role;
        } else if (role.position > highestRole.position) {
          highestRole = role;
        }
      }
    }

    return highestRole?.name || '';
  };

  requestToken = async (code: string) => {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? '',
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI ?? '',
      scope: 'identify+guilds.members.read',
    });

    const response = await axios.post(
      'https://discord.com/api/oauth2/token',
      body,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        withCredentials: true,
      },
    );

    return response.data;
  };

  exchangeActivityCode = async (
    code: string,
  ): Promise<ActivityTokenExchangeResult> => {
    const body = buildActivityTokenExchangeBody(code);

    const response = await axios.post(
      'https://discord.com/api/oauth2/token',
      body,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    return response.data;
  };

  refreshToken = async (refresh_token: string) => {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? '',
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token,
      redirect_uri: process.env.DISCORD_REDIRECT_URI ?? '',
      scope: 'identify',
    });

    const response = await axios.post(
      'https://discord.com/api/oauth2/token',
      body,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        withCredentials: true,
      },
    );

    if (response.status !== 200) {
      throw new Error('Invalid refresh token');
    }

    return response.data;
  };

  getAuthorizationUrl = (state?: string) => {
    let url = `https://discord.com/oauth2/authorize?response_type=code&client_id=${process.env.DISCORD_CLIENT_ID}&scope=identify+guilds.members.read&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI ?? '')}&prompt=none`;
    if (state) {
      url += `&state=${encodeURIComponent(state)}`;
    }
    return url;
  };
}
