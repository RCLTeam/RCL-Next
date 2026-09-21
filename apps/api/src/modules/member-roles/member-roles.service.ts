import { z } from 'zod';
import type { MemberRolesRepository } from './member-roles.repository.js';

const role = z.enum(['viewer', 'admin', 'owner']);
export class MemberRolesService {
  constructor(private readonly repository: MemberRolesRepository) {}
  list(query: unknown) {
    const input = z
      .object({
        search: z.string().trim().max(120).default(''),
        offset: z.coerce.number().int().min(0).max(1000000).default(0)
      })
      .strict()
      .parse(query);
    return this.repository.list(input.search, input.offset);
  }
  changeRole(actorId: string, memberId: unknown, body: unknown) {
    const id = z
      .string()
      .regex(/^\d{17,20}$/)
      .parse(memberId);
    const input = z.object({ role, expectedRole: role }).strict().parse(body);
    return this.repository.changeRole(actorId, id, input);
  }
}
