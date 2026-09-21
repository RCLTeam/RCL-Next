import type { CrudRecord } from '@rcl/contracts';
import { z } from 'zod';
import { AppError, notFound } from '../../shared/app-error.js';
import type { CrudMutation, CrudOperationsRepository } from './crud-operations.repository.js';
import {
  crudReferences,
  crudResources,
  inputSchema,
  keySchema
} from './crud-operations.resources.js';

export class CrudOperationsService {
  constructor(private readonly repository: CrudOperationsRepository) {}
  resources() {
    return crudResources;
  }
  private resource(name: string) {
    const resource = crudResources.find((item) => item.name === name);
    if (!resource) throw notFound('CRUD resource');
    return resource;
  }
  list(name: string, query: unknown, reference = false) {
    const resource = reference
      ? (crudReferences.find((item) => item.name === name) ?? this.resource(name))
      : this.resource(name);
    const { offset, search } = z
      .object({
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
        search: z.string().trim().max(120).default('')
      })
      .strict()
      .parse(query);
    return this.repository.list(resource, offset, search);
  }
  previewDelete(name: string, body: unknown, actorId: string) {
    const resource = this.resource(name);
    const parsed = z
      .object({ key: keySchema(resource), version: z.string().datetime({ offset: true }) })
      .strict()
      .parse(body);
    return this.repository.previewDelete(resource, {
      action: 'delete',
      key: parsed.key as CrudRecord,
      version: parsed.version,
      actorId,
      values: {}
    });
  }
  mutate(name: string, action: CrudMutation['action'], body: unknown, actorId: string) {
    const resource = this.resource(name);
    const parsed =
      action === 'create'
        ? { values: inputSchema(resource).parse(body) as CrudRecord, key: {} as CrudRecord }
        : z
            .object({
              key: keySchema(resource),
              version: z.string().datetime({ offset: true }),
              ...(action === 'update' ? { values: inputSchema(resource) } : {}),
              ...(action === 'delete'
                ? {
                    cascadeConfirmation: z
                      .string()
                      .regex(/^[a-f0-9]{64}$/)
                      .optional()
                  }
                : {})
            })
            .strict()
            .parse(body);
    const values: CrudRecord = 'values' in parsed ? (parsed.values as CrudRecord) : {};
    const key = parsed.key as CrudRecord;
    if (action === 'update') {
      for (const field of resource.fields.filter(
        (field) => field.immutable && resource.keys.includes(field.name)
      )) {
        if (values[field.name] !== key[field.name])
          throw new AppError(422, 'IMMUTABLE_KEY', 'Record keys cannot be changed.');
      }
    }
    if (action !== 'delete') {
      if (name === 'seasons' && values.startsOn && values.endsOn && values.endsOn < values.startsOn)
        throw new AppError(422, 'INVALID_DATES', 'End date must follow start date.');
    }
    return this.repository.mutate(resource, {
      action,
      values,
      key,
      actorId,
      ...('cascadeConfirmation' in parsed && typeof parsed.cascadeConfirmation === 'string'
        ? { cascadeConfirmation: parsed.cascadeConfirmation }
        : {}),
      ...('version' in parsed ? { version: String(parsed.version) } : {})
    });
  }
}
