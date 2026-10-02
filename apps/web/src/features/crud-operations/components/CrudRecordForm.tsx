import type { CrudField, CrudRecord, CrudResource, CrudValue } from '@rcl/contracts';
import React, { useEffect, useId, useState } from 'react';
import { Select } from '../../../shared/components/Selector/Selector.js';
import { normalizeTeamLogoPath, teamLogoDirectory } from '../../../shared/resources/team-logos.js';
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
  const label = `${field.name === 'logoUrl' ? 'Archivo del escudo' : field.label}${field.required ? ' *' : ''}`;
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
      {(field.type === 'boolean' || !field.options) && <label htmlFor={id}>{label}</label>}
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
          label={label}
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
          type={
            field.name === 'logoUrl'
              ? 'text'
              : field.type === 'datetime'
                ? 'datetime-local'
                : field.type
          }
          placeholder={field.name === 'logoUrl' ? 'equipo.webp' : undefined}
          step={field.type === 'datetime' ? '1' : undefined}
          value={
            field.type === 'datetime'
              ? localDateTime(value)
              : field.name === 'logoUrl' &&
                  normalizeTeamLogoPath(String(value ?? '')).startsWith(teamLogoDirectory)
                ? normalizeTeamLogoPath(String(value)).slice(teamLogoDirectory.length)
                : String(value ?? '')
          }
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
                : field.name === 'logoUrl' && !/[/:\\]/.test(input)
                  ? `${teamLogoDirectory}${input}`
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
  const [rows, setRows] = useState<CrudRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const scope = values.idSeasonDivision;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly reloads reference options.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setRows([]);
    async function loadOptions() {
      const records: CrudRecord[] = [];
      try {
        // The dropdown searches locally, so include every reference page.
        let hasMore = true;
        while (hasMore && !controller.signal.aborted) {
          const page = await getCrudRecords(
            `references/${field.reference ?? ''}`,
            '',
            records.length,
            controller.signal,
            250
          );
          records.push(...page.records);
          hasMore = page.hasMore && page.records.length > 0;
        }
        if (!controller.signal.aborted) setRows(records);
      } catch (error: unknown) {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : 'No se pudieron cargar las opciones.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadOptions();
    return () => controller.abort();
  }, [field.reference, retry]);
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
      <Select
        label={`${field.label}${field.required ? ' *' : ''}`}
        variant="form"
        id={id}
        value={String(value ?? '')}
        required={field.required}
        disabled={disabled || loading}
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
      {!loading && !error && eligible.length === 0 && <output>No hay opciones disponibles.</output>}
      {loading && <output>Cargando opciones…</output>}
      {error && (
        <span role="alert">
          {error}{' '}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Reintentar
          </button>
        </span>
      )}
    </div>
  );
}
