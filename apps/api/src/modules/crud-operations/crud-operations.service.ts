import type { CrudRecord } from '@rcl/contracts';
import { z } from 'zod';
import { AppError, notFound } from '../../shared/app-error.js';
import type { CrudMutation, CrudOperationsRepository } from './crud-operations.repository.js';
import { crudResources, inputSchema, keySchema } from './crud-operations.resources.js';

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
  list(name: string, query: unknown) {
    const resource = this.resource(name);
    const { offset, search } = z
      .object({
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
        search: z.string().trim().max(120).default('')
      })
      .strict()
      .parse(query);
    return this.repository.list(resource, offset, search);
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
              ...(action === 'update' ? { values: inputSchema(resource) } : {})
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
      if (name === 'matches') validateMatch(values);
    }
    return this.repository.mutate(resource, {
      action,
      values,
      key,
      actorId,
      ...('version' in parsed ? { version: String(parsed.version) } : {})
    });
  }
}

function validateMatch(values: CrudRecord) {
  const fail = () => {
    throw new AppError(
      422,
      'INVALID_MATCH',
      'Check teams, best-of, scores, winner, status and dates.'
    );
  };
  const bestOf = Number(values.bestOf);
  const home = Number(values.team1Score);
  const away = Number(values.team2Score);
  const target = Math.floor(bestOf / 2) + 1;
  if (
    ![1, 3, 5].includes(bestOf) ||
    values.team1Id === values.team2Id ||
    home > target ||
    away > target ||
    (home === target && away === target)
  )
    fail();
  if (values.winnerTeamId && ![values.team1Id, values.team2Id].includes(values.winnerTeamId))
    fail();
  if (['completed', 'forfeit'].includes(String(values.status))) {
    if (
      !values.winnerTeamId ||
      home === away ||
      values.winnerTeamId !== (home > away ? values.team1Id : values.team2Id)
    )
      fail();
    if (values.status === 'completed' && Math.max(home, away) !== target) fail();
  } else if (values.winnerTeamId || home === target || away === target) fail();
  if (values.scheduledAt && values.finishedAt) {
    if (Date.parse(String(values.finishedAt)) < Date.parse(String(values.scheduledAt))) fail();
  }
}
