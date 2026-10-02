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
  matchMaps(matchId: string) {
    return this.repository.matchMaps(z.string().uuid().parse(matchId));
  }
  reorderMaps(matchId: string, body: unknown, actorId: string) {
    const ids = z.array(z.string().uuid()).max(32767);
    const order = z.object({ expectedOrder: ids, gameIds: ids }).strict().parse(body);
    if (
      new Set(order.gameIds).size !== order.gameIds.length ||
      new Set(order.expectedOrder).size !== order.expectedOrder.length ||
      order.gameIds.length !== order.expectedOrder.length ||
      order.gameIds.some((id) => !order.expectedOrder.includes(id))
    )
      throw new AppError(422, 'INVALID_MAP_ORDER', 'Include all maps exactly once');
    return this.repository.reorderMaps(z.string().uuid().parse(matchId), order, actorId);
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
    const { offset, search, limit } = z
      .object({
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(reference ? 250 : 50)
          .default(50),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
        search: z.string().trim().max(120).default('')
      })
      .strict()
      .parse(query);
    return this.repository.list(resource, offset, search, limit);
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
      if (name === 'matches') {
        const fail = (message: string) => {
          throw new AppError(422, 'INVALID_RESULT', message);
        };
        const home = Number(values.team1Score);
        const away = Number(values.team2Score);
        const threshold = Math.floor(Number(values.bestOf) / 2) + 1;
        if (![1, 3, 5].includes(Number(values.bestOf))) fail('El formato debe ser BO1, BO3 o BO5.');
        if (values.team1Id === values.team2Id) fail('Selecciona dos equipos distintos.');
        if (values.winnerTeamId && ![values.team1Id, values.team2Id].includes(values.winnerTeamId))
          fail('El ganador debe ser uno de los equipos del encuentro.');
        if (values.status === 'completed') {
          const winner = home > away ? values.team1Id : values.team2Id;
          if (
            Math.max(home, away) !== threshold ||
            Math.min(home, away) >= threshold ||
            values.winnerTeamId !== winner
          )
            fail(
              'El marcador y el ganador deben corresponder a una serie finalizada según su formato.'
            );
        }
        if (values.status === 'forfeit' && !values.winnerTeamId)
          fail('Selecciona el ganador de la victoria por incomparecencia.');
      }
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
