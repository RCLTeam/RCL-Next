import type { CrystalAnswers, CrystalQuestion } from '@rcl/contracts';
import React from 'react';
import { CrystalAnswerPicker } from './CrystalAnswerPicker.js';
import { crystalAnswerLabel } from './crystal-answer-label.js';

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
        const other = q.id.startsWith('winner:')
          ? answers[q.id.replace('winner:', 'loser:')]
          : q.id.startsWith('loser:')
            ? answers[q.id.replace('loser:', 'winner:')]
            : [];
        const result = results[q.id];
        return (
          <fieldset key={q.id} className={`crystal-card${q.count > 1 ? ' crystal-bracket' : ''}`}>
            <legend>{q.label}</legend>
            {q.count > 1 && (
              <p className="crystal-hint">
                {values.length}/{q.count} equipos seleccionados
              </p>
            )}
            {q.kind === 'integer' ? (
              <label>
                <span className="sr-only">{q.label}</span>
                <input
                  type="number"
                  disabled={disabled}
                  min="0"
                  max="9999999"
                  step="1"
                  required={!manual}
                  value={values[0] ?? ''}
                  onChange={(e) => choose(q.id, e.target.value ? [e.target.value] : [])}
                />
              </label>
            ) : (
              <CrystalAnswerPicker
                question={q}
                values={values}
                excluded={other ?? []}
                disabled={disabled}
                manual={manual}
                onChange={(next) => choose(q.id, next)}
              />
            )}
            {result && (
              <p className="crystal-result">
                Resultado: {result.map((id) => crystalAnswerLabel(q, id)).join(', ')}
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
