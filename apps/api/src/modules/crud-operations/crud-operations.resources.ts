import type { CrudField, CrudResource } from '@rcl/contracts';
import { z } from 'zod';

export type ResourceDefinition = CrudResource;
const text = (name: string, label: string, maxLength: number, required = false): CrudField => ({
  name,
  label,
  type: 'text',
  maxLength,
  required
});
const ref = (name: string, label: string, reference: string, required = true): CrudField => ({
  name,
  label,
  type: 'select',
  reference,
  required
});
const bool = (name: string, label: string, defaultValue = false): CrudField => ({
  name,
  label,
  type: 'boolean',
  required: true,
  defaultValue
});
const number = (
  name: string,
  label: string,
  min = 0,
  max = 32767,
  defaultValue = 0
): CrudField => ({ name, label, type: 'number', required: true, min, max, defaultValue });
const options = (
  name: string,
  label: string,
  values: string[],
  defaultValue: string
): CrudField => ({ name, label, type: 'select', options: values, required: true, defaultValue });
const date = (name: string, label: string, type: 'date' | 'datetime' = 'datetime'): CrudField => ({
  name,
  label,
  type
});
const fixed = (field: CrudField): CrudField => ({ ...field, immutable: true });

// Explicit allowlist: sessions, privileges, audit logs and ROFL snapshots are never editable here.
export const crudResources: ResourceDefinition[] = [
  {
    name: 'seasons',
    label: 'Temporadas',
    description: 'Temporadas de la liga y sus fechas de inicio y fin.',
    keys: ['name'],
    fields: [
      fixed(text('name', 'Nombre', 120, true)),
      date('startsOn', 'Inicio', 'date'),
      date('endsOn', 'Fin', 'date')
    ]
  },
  {
    name: 'divisions',
    label: 'Divisiones',
    description: 'Catálogo de divisiones y orden de presentación.',
    keys: ['name'],
    fields: [fixed(text('name', 'Nombre', 80, true)), number('sortOrder', 'Orden')]
  },
  {
    name: 'competitions',
    label: 'Competiciones',
    description: 'Vincula cada división con las temporadas en las que participa.',
    keys: ['id'],
    fields: [
      ref('seasonName', 'Temporada', 'seasons'),
      ref('divisionName', 'División', 'divisions')
    ]
  },
  {
    name: 'teams',
    label: 'Equipos',
    description: 'Equipos inscritos en cada competición y su identidad visual.',
    keys: ['id'],
    fields: [
      ref('seasonDivisionId', 'Competición', 'competitions'),
      text('name', 'Nombre', 120, true),
      text('shortName', 'Abreviatura', 16),
      { name: 'logoUrl', label: 'URL del escudo', type: 'url' },
      text('color', 'Color (#RRGGBB)', 7),
      bool('isActive', 'Activo', true)
    ]
  },
  {
    name: 'users',
    label: 'Miembros',
    description:
      'Identidades Discord para vincular cuentas y plantillas. Los permisos de acceso se administran por separado.',
    keys: ['discordId'],
    fields: [
      fixed(text('discordId', 'ID de Discord', 32, true)),
      text('username', 'Usuario', 64, true),
      text('globalName', 'Nombre visible', 64)
    ]
  },
  {
    name: 'players',
    label: 'Jugadores',
    description: 'Cuentas Riot y su vínculo con Discord para identificar las repeticiones.',
    keys: ['id'],
    fields: [
      text('gameName', 'Nombre Riot', 64, true),
      text('riotTag', 'Tag Riot (sin #)', 16),
      ref('discordUserId', 'Miembro de Discord', 'users', false),
      text('puuid', 'PUUID', 128),
      text('countryCode', 'País (ES, FR…)', 2),
      bool('isMain', 'Cuenta principal')
    ]
  },
  {
    name: 'memberships',
    label: 'Plantillas',
    description: 'Asigna miembros a equipos, roles y capitanía. Cada cambio queda en el historial.',
    keys: ['teamId', 'discordUserId'],
    fields: [
      fixed(ref('teamId', 'Equipo', 'teams')),
      fixed(ref('discordUserId', 'Miembro de Discord', 'users')),
      options(
        'role',
        'Rol',
        ['top', 'jungle', 'mid', 'adc', 'support', 'substitute', 'coach', 'staff', 'partners'],
        'substitute'
      ),
      bool('isCaptain', 'Capitán')
    ]
  },
  {
    name: 'rounds',
    label: 'Jornadas',
    description: 'Jornadas de fase regular o playoffs dentro de cada competición.',
    keys: ['id', 'idSeasonDivision'],
    fields: [
      fixed(ref('idSeasonDivision', 'Competición', 'competitions')),
      fixed(number('id', 'Número de jornada', 1, 32767, 1)),
      options('stage', 'Fase', ['regular', 'playoff'], 'regular'),
      text('name', 'Nombre', 120),
      date('startsAt', 'Fecha de inicio')
    ]
  },
  {
    name: 'matches',
    label: 'Encuentros',
    description:
      'Calendario, emisiones y resultados manuales. Los resultados con mapas importados se mantienen desde ROFL.',
    keys: ['id'],
    fields: [
      ref('idSeasonDivision', 'Competición', 'competitions'),
      { name: 'idRound', label: 'Jornada', type: 'select', reference: 'rounds' },
      ref('team1Id', 'Equipo local', 'teams'),
      ref('team2Id', 'Equipo visitante', 'teams'),
      { ...number('bestOf', 'Mejor de', 1, 5, 1), options: ['1', '3', '5'] },
      options(
        'status',
        'Estado',
        ['scheduled', 'live', 'completed', 'cancelled', 'forfeit'],
        'scheduled'
      ),
      date('scheduledAt', 'Fecha programada'),
      date('finishedAt', 'Fecha de finalización'),
      ref('winnerTeamId', 'Ganador', 'teams', false),
      number('team1Score', 'Mapas local', 0, 3),
      number('team2Score', 'Mapas visitante', 0, 3),
      { name: 'streamUrl', label: 'URL de emisión', type: 'url' },
      text('notes', 'Notas', 5000)
    ]
  }
];

function fieldSchema(field: CrudField): z.ZodTypeAny {
  let value: z.ZodTypeAny;
  if (field.type === 'boolean') value = z.boolean();
  else if (field.type === 'number')
    value = z
      .number()
      .int()
      .min(field.min ?? 0)
      .max(field.max ?? 32767);
  else if (field.type === 'date') value = z.string().date();
  else if (field.type === 'datetime') value = z.string().datetime({ offset: true });
  else if (field.type === 'url')
    value = z
      .string()
      .max(2048)
      .url()
      .refine((url) => ['https:', 'http:'].includes(new URL(url).protocol));
  else if (field.name === 'idRound') value = z.number().int().min(1).max(32767);
  else if (field.options) value = z.enum(field.options as [string, ...string[]]);
  else if (field.reference && !['seasons', 'divisions', 'users'].includes(field.reference))
    value = z.string().uuid();
  else {
    let string = z
      .string()
      .trim()
      .min(1)
      .max(field.maxLength ?? 120);
    if (['discordId', 'discordUserId'].includes(field.name)) string = string.regex(/^\d{17,20}$/);
    if (field.name === 'color') string = string.regex(/^#[0-9a-fA-F]{6}$/);
    if (field.name === 'countryCode') string = string.regex(/^[A-Z]{2}$/);
    value = string;
  }
  if (!field.required) value = value.nullable().default(null);
  else if (field.defaultValue !== undefined) value = value.default(field.defaultValue);
  return value;
}

export function inputSchema(resource: ResourceDefinition) {
  return z
    .object(Object.fromEntries(resource.fields.map((field) => [field.name, fieldSchema(field)])))
    .strict();
}

export function keySchema(resource: ResourceDefinition) {
  return z
    .object(
      Object.fromEntries(
        resource.keys.map((name) => {
          const field = resource.fields.find((field) => field.name === name);
          return [name, field ? fieldSchema(field) : z.string().uuid()];
        })
      )
    )
    .strict();
}
