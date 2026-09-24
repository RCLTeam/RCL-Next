import React, { useId } from 'react';

export function ContentField({
  label,
  value,
  onChange,
  maxLength,
  multiline = false,
  required = true,
  type = 'text',
  hint
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  multiline?: boolean;
  required?: boolean;
  type?: 'text' | 'url';
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="content-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          maxLength={maxLength}
          rows={label === 'Contenido' ? 16 : 3}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          maxLength={maxLength}
          pattern={type === 'url' ? 'https://.*' : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
