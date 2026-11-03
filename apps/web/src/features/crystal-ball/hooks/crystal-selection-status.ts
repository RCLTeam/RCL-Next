import type { useCompetitionSelection } from '../../competition/hooks/useCompetitionSelection.js';
export function crystalSelectionStatus(
  competition: Pick<
    ReturnType<typeof useCompetitionSelection>,
    'season' | 'seasons' | 'division' | 'divisions'
  >
) {
  if (competition.seasons.status === 'error') return 'No se pudieron cargar las temporadas.';
  if (!competition.season)
    return competition.seasons.status === 'ready'
      ? 'No hay temporadas disponibles.'
      : 'Cargando temporadas…';
  if (competition.divisions.status === 'error') return 'No se pudieron cargar las ligas.';
  if (!competition.division)
    return competition.divisions.status === 'ready'
      ? 'Esta temporada no tiene ligas.'
      : 'Cargando ligas…';
  return null;
}
