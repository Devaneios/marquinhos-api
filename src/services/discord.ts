import axios from 'axios';

export class DiscordService {
  getDiscordUser = async (token: string) => {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    return data;
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

    const guildUser = await guildUserResponse.json();

    const guildRolesResponse = await axios.get(
      `https://discord.com/api/guilds/305861924648779779/roles`,
      {
        headers: {
          'User-Agent': 'DiscordBot',
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      },
    );

    const guildRoles = guildRolesResponse.data;

    let highestRole: any = null;

    guildRoles.forEach((role: any) => {
      if (guildUser.roles.includes(role.id)) {
        if (!highestRole) {
          highestRole = role;
        } else if (role.position > highestRole.position) {
          highestRole = role;
        }
      }
    });

    return highestRole?.name ?? '';
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

  getAuthorizationUrl = () => {
    return `https://discord.com/oauth2/authorize?response_type=code&client_id=${process.env.DISCORD_CLIENT_ID}&scope=identify+guilds.members.read&redirect_uri=${process.env.DISCORD_REDIRECT_URI}&prompt=none`;
  };
}
