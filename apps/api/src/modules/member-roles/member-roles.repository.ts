import type { ChangeMemberRole, MemberRolesPage, RoleMember } from '@rcl/contracts';

export interface MemberRolesRepository {
  list(search: string, offset: number): Promise<MemberRolesPage>;
  changeRole(actorId: string, memberId: string, change: ChangeMemberRole): Promise<RoleMember>;
}
