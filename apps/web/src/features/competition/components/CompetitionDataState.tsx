import React from 'react';
import {
  type DataStateProps,
  DataState as SharedDataState
} from '../../../shared/components/DataState.js';
import type { Competition } from '../hooks/useCompetition.js';
import type { CollectionState } from '../types/competition.types.js';

export function resolveCompetitionState<T>(
  competition: Competition,
  state: CollectionState<T>
): CollectionState<T> {
  const parent =
    competition.seasons.status !== 'ready' ? competition.seasons : competition.divisions;
  return parent.status !== 'ready' ? { status: parent.status, data: [] } : state;
}

export function DataState<T>({
  loadingMessage = 'Cargando competición…',
  errorMessage = 'No se pudo cargar la competición.',
  ...props
}: DataStateProps<T>) {
  return <SharedDataState loadingMessage={loadingMessage} errorMessage={errorMessage} {...props} />;
}
