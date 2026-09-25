import type { CrudField, CrudRecord, CrudResource, CrudValue } from '@rcl/contracts';
import React, { useEffect, useId, useState } from 'react';
import { Select } from '../../../shared/components/Selector/Selector.js';
import { getCrudRecords, recordLabel } from '../api/crud-operations-api.js';

export function initialValues(resource: CrudResource, record: CrudRecord | null): CrudRecord {
  return Object.fromEntries(
    resource.fields.map((field) => [
      field.name,
      record?.[field.name] ?? field.defaultValue ?? (field.type === 'boolean' ? false : null)
    ])
  );
}
function localDateTime(value: CrudValue): string {
  if (!value) return '';
  const date = new Date(String(value));
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

export function CrudRecordForm({
  resource,
  record,
  busy,
  onSave,
  onCancel
}: {
  resource: CrudResource;
  record: CrudRecord | null;
  busy: boolean;
  onSave: (values: CrudRecord) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => initialValues(resource, record));
  const change = (name: string, value: CrudValue) =>
    setValues((previous) => {
      const next = { ...previous, [name]: value };
      if (name === 'idSeasonDivision' && resource.name === 'matches') {
        next.team1Id = null;
        next.team2Id = null;
        next.winnerTeamId = null;
        next.idRound = null;
      }
      if (['team1Id', 'team2Id'].includes(name)) next.winnerTeamId = null;
      return next;
    });
  return (
    <form
      className="crud-operations-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(values);
      }}
    >
      <h3>{record ? 'Editar registro' : 'Nuevo registro'}</h3>
      <p>Los campos con * son obligatorios. Las fechas y horas se muestran en tu zona horaria.</p>
      <fieldset disabled={busy} className="crud-operations-fields">
        <legend className="sr-only">Datos de {resource.label}</legend>
        {resource.fields.map((field) => (
          <RecordField
            key={field.name}
            field={field}
            value={values[field.name] ?? null}
            values={values}
            disabled={Boolean(record && field.immutable)}
            onChange={(value) => change(field.name, value)}
          />
        ))}
      </fieldset>
      <div className="crud-operations-actions">
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button className="btn-ghost" type="button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function RecordField({
  field,
  value,
  values,
  disabled,
  onChange
}: {
  field: CrudField;
  value: CrudValue;
  values: CrudRecord;
  disabled: boolean;
  onChange: (value: CrudValue) => void;
}) {
  const id = useId();
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (field.reference)
    return (
      <ReferenceField
        field={field}
        value={value}
        values={values}
        disabled={disabled}
        onChange={onChange}
      />
    );
  return (
    <div className="crud-operations-field">
      <label htmlFor={id}>{label}</label>
      {field.type === 'boolean' ? (
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : field.options ? (
        <Select
          variant="form"
          id={id}
          value={String(value ?? '')}
          required={field.required}
          disabled={disabled}
          onChange={(event) =>
            onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)
          }
        >
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : (
        <input
          id={id}
          type={field.type === 'datetime' ? 'datetime-local' : field.type}
          step={field.type === 'datetime' ? '1' : undefined}
          value={field.type === 'datetime' ? localDateTime(value) : String(value ?? '')}
          required={field.required}
          disabled={disabled}
          maxLength={field.maxLength}
          min={field.min}
          max={field.max}
          onChange={(event) => {
            const input = event.target.value;
            onChange(
              !input
                ? null
                : field.type === 'number'
                  ? Number(input)
                  : field.type === 'datetime'
                    ? new Date(input).toISOString()
                    : input
            );
          }}
        />
      )}
    </div>
  );
}

function ReferenceField({
  field,
  value,
  values,
  disabled,
  onChange
}: {
  field: CrudField;
  value: CrudValue;
  values: CrudRecord;
  disabled: boolean;
  onChange: (value: CrudValue) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<CrudRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const scope = values.idSeasonDivision;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly reloads reference options.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      getCrudRecords(`references/${field.reference ?? ''}`, search, offset, controller.signal)
        .then((result) => {
          setRows((previous) => (offset ? [...previous, ...result.records] : result.records));
          setHasMore(result.hasMore);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setError(
              error instanceof Error ? error.message : 'No se pudieron cargar las opciones.'
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [field.reference, search, offset, retry]);
  const eligible = rows.filter((row) => {
    if (field.reference === 'rounds') return row.idSeasonDivision === scope;
    if (field.reference === 'teams' && scope && row.seasonDivisionId !== scope) return false;
    if (field.name === 'winnerTeamId')
      return [values.team1Id, values.team2Id].includes(row.id ?? null);
    return true;
  });
  const optionValue = (row: CrudRecord) =>
    row[
      field.reference === 'users'
        ? 'discordId'
        : ['seasons', 'divisions'].includes(field.reference ?? '')
          ? 'name'
          : 'id'
    ];
  return (
    <div className="crud-operations-field">
      <label htmlFor={id}>
        {field.label}
        {field.required ? ' *' : ''}
      </label>
      {!disabled && (
        <input
          type="search"
          aria-label={`Buscar ${field.label}`}
          placeholder="Buscar opciones…"
          value={search}
          maxLength={120}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
        />
      )}
      <Select
        variant="form"
        id={id}
        value={String(value ?? '')}
        required={field.required}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            !event.target.value
              ? null
              : field.reference === 'rounds'
                ? Number(event.target.value)
                : event.target.value
          )
        }
      >
        <option value="">{field.required ? 'Selecciona una opción' : 'Sin asignar'}</option>
        {value !== null && !eligible.some((row) => optionValue(row) === value) && (
          <option value={String(value)}>{String(value)} (selección actual)</option>
        )}
        {eligible.map((row) => (
          <option key={String(optionValue(row))} value={String(optionValue(row))}>
            {recordLabel(row)}
          </option>
        ))}
      </Select>
      {loading && <output>Cargando opciones…</output>}
      {error && (
        <span role="alert">
          {error}{' '}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Reintentar
          </button>
        </span>
      )}
      {hasMore && !disabled && (
        <button
          type="button"
          className="btn-ghost"
          disabled={loading}
          onClick={() => setOffset(offset + 50)}
        >
          Más opciones
        </button>
      )}
      {field.reference === 'rounds' && <small>Solo jornadas de la competición seleccionada.</small>}
    </div>
  );
}
