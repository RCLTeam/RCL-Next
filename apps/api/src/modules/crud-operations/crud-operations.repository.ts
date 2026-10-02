import type {
  AdminMatchMap,
  CrudDeletePreview,
  CrudPageResult,
  CrudRecord,
  MatchMapOrder
} from '@rcl/contracts';
import type { ResourceDefinition } from './crud-operations.resources.js';

export interface CrudMutation {
  action: 'create' | 'update' | 'delete';
  key: CrudRecord;
  values: CrudRecord;
  version?: string;
  actorId: string;
  cascadeConfirmation?: string;
}
export interface CrudOperationsRepository {
  matchMaps(matchId: string): Promise<AdminMatchMap[]>;
  reorderMaps(matchId: string, order: MatchMapOrder, actorId: string): Promise<void>;
  previewDelete(resource: ResourceDefinition, mutation: CrudMutation): Promise<CrudDeletePreview>;
  list(resource: ResourceDefinition, offset: number, search: string): Promise<CrudPageResult>;
  mutate(resource: ResourceDefinition, mutation: CrudMutation): Promise<CrudRecord>;
}
