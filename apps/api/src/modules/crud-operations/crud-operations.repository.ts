import type { CrudPageResult, CrudRecord } from '@rcl/contracts';
import type { ResourceDefinition } from './crud-operations.resources.js';

export interface CrudMutation {
  action: 'create' | 'update' | 'delete';
  key: CrudRecord;
  values: CrudRecord;
  version?: string;
  actorId: string;
}
export interface CrudOperationsRepository {
  list(resource: ResourceDefinition, offset: number, search: string): Promise<CrudPageResult>;
  mutate(resource: ResourceDefinition, mutation: CrudMutation): Promise<CrudRecord>;
}
