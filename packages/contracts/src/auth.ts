export interface AuthUser {
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
  role: 'viewer' | 'admin';
}
