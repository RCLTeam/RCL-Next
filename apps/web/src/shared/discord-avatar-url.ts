export function discordAvatarUrl(discordId: string, hash: string): string {
  return `/api/v1/discord-avatars/${encodeURIComponent(discordId)}/${encodeURIComponent(hash)}`;
}
