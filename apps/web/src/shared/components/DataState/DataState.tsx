import React, { type ReactNode } from 'react';
import './data-state.css';

export type DataStatus<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'error'; error: string; data?: undefined }
  | { status: 'ready'; data: T; error?: undefined };

export interface DataStateProps<T> {
  state:
    | DataStatus<T>
    | { status: 'loading' | 'error'; data?: unknown; error?: string }
    | { status: 'ready'; data: T; error?: undefined };
  onRetry?: (() => void) | undefined;
  retry?: (() => void) | undefined;
  loadingMessage?: string | undefined;
  errorMessage?: string | undefined;
  emptyMessage?: string | undefined;
  empty?: ReactNode | undefined;
  children: ReactNode | ((data: T) => ReactNode);
}

export function DataState<T>({
  state,
  onRetry,
  retry,
  loadingMessage = 'Cargando…',
  errorMessage,
  emptyMessage = 'No hay datos disponibles.',
  empty,
  children
}: DataStateProps<T>) {
  const handleRetry = onRetry ?? retry;
  const resolvedEmpty = empty ?? emptyMessage;

  if (state.status === 'loading') {
    return <output className="empty-state">{loadingMessage}</output>;
  }

  if (state.status === 'error') {
    const errorText =
      errorMessage ??
      ('error' in state && typeof state.error === 'string' ? state.error : 'Ha ocurrido un error.');
    return (
      <div className="empty-state error-state" role="alert">
        <p>{errorText}</p>
        {handleRetry && (
          <button type="button" className="btn-ghost" onClick={handleRetry}>
            Reintentar
          </button>
        )}
      </div>
    );
  }

  if (Array.isArray(state.data) && state.data.length === 0) {
    return (
      <div className="empty-state">
        {typeof resolvedEmpty === 'string' ? <p>{resolvedEmpty}</p> : resolvedEmpty}
      </div>
    );
  }

  if (typeof children === 'function') {
    return <>{(children as (data: T) => ReactNode)(state.data as T)}</>;
  }

  return <>{children}</>;
}
