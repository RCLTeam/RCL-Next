import React, { type ComponentPropsWithRef, type ReactNode, useId } from 'react';
import './selector.css';

export type SelectProps = ComponentPropsWithRef<'select'> & {
  variant?: 'default' | 'form' | 'resource';
  label?: ReactNode;
  fieldClassName?: string;
};

/** Native select props, events, refs and option/optgroup children are preserved. */
export function Select({
  variant = 'default',
  className,
  label,
  fieldClassName,
  id,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const select = (
    <select
      {...props}
      id={selectId}
      className={['rcl-select', `rcl-select--${variant}`, className].filter(Boolean).join(' ')}
    />
  );

  if (label == null) return select;

  return (
    <div
      className={['rcl-select-field', variant === 'default' && 'select-field', fieldClassName]
        .filter(Boolean)
        .join(' ')}
    >
      <label className="rcl-select-label" htmlFor={selectId}>
        {label}
      </label>
      {select}
    </div>
  );
}
