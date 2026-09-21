import type { AuthUser } from './auth.js';

export type MemberRole = AuthUser['role'];
export interface RoleMember {
  discordId: string;
  username: string;
  globalName: string | null;
  role: MemberRole;
}
export interface MemberRolesPage {
  members: RoleMember[];
  hasMore: boolean;
}
export interface ChangeMemberRole {
  role: MemberRole;
  expectedRole: MemberRole;
}
