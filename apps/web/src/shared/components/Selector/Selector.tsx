import React, { type ComponentPropsWithRef } from 'react';
import './selector.css';

export type SelectProps = ComponentPropsWithRef<'select'> & {
  variant?: 'default' | 'form' | 'resource';
};

/** Native select props, events and option/optgroup children are preserved. */
export function Select({ variant = 'default', className, ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={['rcl-select', `rcl-select--${variant}`, className].filter(Boolean).join(' ')}
    />
  );
}
