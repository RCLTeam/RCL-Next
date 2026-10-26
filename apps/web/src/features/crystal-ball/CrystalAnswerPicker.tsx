import type { CrystalQuestion } from '@rcl/contracts';
import React, { useState } from 'react';
import { Modal } from '../../shared/components/Modal/Modal.js';
import { discordAvatarUrl } from '../../shared/discord-avatar-url.js';
import { TeamBadge } from '../competition/components/TeamBadge.js';
import './crystal-picker.css';

type Option = CrystalQuestion['options'][number];
const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

function AnswerIcon({ option, kind }: { option: Option; kind: CrystalQuestion['kind'] }) {
  const [failed, setFailed] = useState(false);
  const image =
    kind === 'player' && option.discordId && option.avatarHash
      ? discordAvatarUrl(option.discordId, option.avatarHash)
      : option.imageUrl;
  return (
    <span className={`crystal-answer-icon is-${kind}`} aria-hidden="true">
      {kind === 'team' ? (
        <TeamBadge
          team={{
            name: option.name,
            shortName: option.name.slice(0, 3),
            logoUrl: option.imageUrl ?? null
          }}
        />
      ) : image && !failed ? (
        <img src={image} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : kind === 'player' ? (
        <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
          <circle cx="24" cy="15" r="9" />
          <path d="M7 44v-5a17 17 0 0 1 34 0v5Z" />
        </svg>
      ) : (
        <span>{kind === 'duration' ? '◷' : option.name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

export function CrystalAnswerPicker({
  question,
  values,
  excluded,
  disabled,
  manual,
  onChange
}: {
  question: CrystalQuestion;
  values: string[];
  excluded: string[];
  disabled: boolean;
  manual: boolean;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(values);
  const [query, setQuery] = useState('');
  const multiple = question.count > 1 || (manual && question.kind !== 'duration');
  const limit = question.count > 1 ? question.count : multiple ? Number.POSITIVE_INFINITY : 1;
  const options = question.options.filter((option) =>
    normalize(option.name).includes(normalize(query))
  );
  const optionFor = (id: string) =>
    question.options.find((option) => option.id === id) ?? { id, name: id };
  const valid =
    (manual && draft.length === 0) ||
    (multiple && question.count === 1 ? draft.length > 0 : draft.length === question.count);
  return (
    <>
      <button
        type="button"
        className="crystal-pick-trigger"
        aria-label={`${disabled ? 'Ver' : 'Elegir'}: ${question.label}`}
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(values);
          setQuery('');
          setOpen(true);
        }}
      >
        <span className="crystal-pick-preview">
          {values.length ? (
            values.map((id) => (
              <span key={id} className="crystal-pick-choice" title={optionFor(id).name}>
                <AnswerIcon option={optionFor(id)} kind={question.kind} />
                <span>{optionFor(id).name}</span>
              </span>
            ))
          ) : (
            <>
              <span className="crystal-pick-empty" aria-hidden="true">
                ＋
              </span>
              <span>Sin seleccionar</span>
            </>
          )}
        </span>
        <span className="crystal-pick-action">{disabled ? 'Ver opciones' : 'Elegir'} ↗</span>
      </button>
      {open && (
        <Modal
          title={<span className="crystal-picker-title">{question.label}</span>}
          onClose={() => setOpen(false)}
          maxWidth="880px"
        >
          <div className="crystal-picker">
            <p>
              {disabled
                ? 'Consulta las opciones. La edición está bloqueada.'
                : multiple
                  ? question.count > 1
                    ? `Elige ${question.count} equipos. Los de la otra rama no están disponibles.`
                    : 'Selecciona los ganadores. Puedes marcar varios en caso de empate.'
                  : 'Selecciona una respuesta y confirma tu elección.'}
            </p>
            <label className="crystal-picker-search">
              Buscar
              <input
                type="search"
                value={query}
                placeholder="Buscar por nombre…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <fieldset className="crystal-picker-grid" aria-label="Opciones de respuesta">
              {options.map((option) => {
                const selected = draft.includes(option.id);
                const blocked =
                  excluded.includes(option.id) || (!selected && multiple && draft.length >= limit);
                return (
                  <button
                    type="button"
                    key={option.id}
                    aria-pressed={selected}
                    disabled={disabled || blocked}
                    title={
                      excluded.includes(option.id) ? 'Seleccionado en la otra rama' : option.name
                    }
                    onClick={() =>
                      setDraft(
                        multiple
                          ? selected
                            ? draft.filter((id) => id !== option.id)
                            : [...draft, option.id]
                          : [option.id]
                      )
                    }
                  >
                    <AnswerIcon option={option} kind={question.kind} />
                    <span>{option.name}</span>
                    {selected && (
                      <span className="crystal-picked-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </fieldset>
            {!options.length && <output>No hay opciones que coincidan con la búsqueda.</output>}
            <div className="crystal-picker-footer">
              <output>
                {draft.length} {Number.isFinite(limit) ? `/ ${limit}` : ''} seleccionados
              </output>
              {!disabled && (
                <button type="button" className="crystal-picker-clear" onClick={() => setDraft([])}>
                  Limpiar
                </button>
              )}
              <button
                type="button"
                className="crystal-picker-confirm"
                disabled={!disabled && !valid}
                onClick={() => {
                  if (!disabled) onChange(draft);
                  setOpen(false);
                }}
              >
                {disabled ? 'Cerrar' : 'Confirmar selección'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
