import type { CrystalAnswers, CrystalQuestion } from '@rcl/contracts';
import React from 'react';
import { Select } from '../../shared/components/Selector/Selector.js';

export function CrystalFields({
  questions,
  answers,
  onChange,
  disabled,
  results = {},
  manual = false
}: {
  questions: CrystalQuestion[];
  answers: CrystalAnswers;
  onChange: (answers: CrystalAnswers) => void;
  disabled: boolean;
  results?: CrystalAnswers;
  manual?: boolean;
}) {
  const choose = (id: string, values: string[]) => {
    const next = { ...answers };
    if (values.length) next[id] = values;
    else delete next[id];
    onChange(next);
  };
  return (
    <div className="crystal-grid">
      {questions.map((q) => {
        const values = answers[q.id] ?? [];
        const multi = q.count > 1 || (manual && q.kind !== 'integer' && q.kind !== 'duration');
        const other = q.id.startsWith('winner:')
          ? answers[q.id.replace('winner:', 'loser:')]
          : q.id.startsWith('loser:')
            ? answers[q.id.replace('loser:', 'winner:')]
            : [];
        const result = results[q.id];
        return (
          <fieldset
            key={q.id}
            className={`crystal-card${q.count > 1 ? ' crystal-bracket' : ''}`}
            disabled={disabled}
          >
            <legend>{q.label}</legend>
            <p className="crystal-hint">
              {q.count > 1
                ? `${values.length}/${q.count} equipos · 1 punto por equipo en la rama correcta`
                : manual
                  ? 'Selecciona todos los ganadores en caso de empate.'
                  : '1 punto por acierto'}
            </p>
            {multi ? (
              <div className="crystal-options">
                {q.options.map((option) => (
                  <label
                    key={option.id}
                    className={values.includes(option.id) ? 'is-selected' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={values.includes(option.id)}
                      disabled={
                        !values.includes(option.id) &&
                        (Boolean(other?.includes(option.id)) ||
                          (q.count > 1 && values.length >= q.count))
                      }
                      onChange={(e) =>
                        choose(
                          q.id,
                          e.target.checked
                            ? [...values, option.id]
                            : values.filter((v) => v !== option.id)
                        )
                      }
                    />
                    {q.kind === 'team' && (
                      <span className="crystal-team-mark" aria-hidden="true">
                        {option.name
                          .replace(/[^\p{L}\p{N}]/gu, '')
                          .slice(0, 3)
                          .toUpperCase()}
                      </span>
                    )}
                    <span>{option.name}</span>
                  </label>
                ))}
              </div>
            ) : q.kind === 'integer' ? (
              <label>
                <span className="sr-only">{q.label}</span>
                <input
                  type="number"
                  min="0"
                  max="9999999"
                  step="1"
                  required={!manual}
                  value={values[0] ?? ''}
                  onChange={(e) => choose(q.id, e.target.value ? [e.target.value] : [])}
                />
              </label>
            ) : (
              <Select
                aria-label={q.label}
                variant="form"
                required={!manual}
                value={values[0] ?? ''}
                onChange={(e) => choose(q.id, e.target.value ? [e.target.value] : [])}
              >
                <option value="">Seleccionar…</option>
                {values[0] && !q.options.some((o) => o.id === values[0]) && (
                  <option value={values[0]}>{values[0]}</option>
                )}
                {q.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
            {result && (
              <p className="crystal-result">
                Resultado:{' '}
                {result.map((id) => q.options.find((o) => o.id === id)?.name ?? id).join(', ')}
                {values.length > 0 && (
                  <strong> · {values.filter((id) => result.includes(id)).length} acierto(s)</strong>
                )}
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
