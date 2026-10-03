import { type PageMetadata, getPageMetadata } from '@rcl/contracts';
import { ZodError } from 'zod';
import { AppError } from '../../shared/app-error.js';
import type { CompetitionService } from '../competition/competition.service.js';
import type { HomeContentService } from '../home-content/home-content.service.js';

export class PageMetadataService {
  constructor(
    private readonly competition: Pick<
      CompetitionService,
      'teamDetail' | 'playerDetail' | 'matchDetail'
    >,
    private readonly content?: Pick<HomeContentService, 'article'>
  ) {}

  async resolve(path: string): Promise<PageMetadata> {
    const fallback = getPageMetadata(path);
    const detail = /^\/(equipos|jugadores|partidos|editorial)\/([^/]+)\/?$/.exec(path);
    if (!detail?.[2]) return fallback;
    let id: string;
    try {
      id = decodeURIComponent(detail[2]);
    } catch {
      return getPageMetadata('/404');
    }
    try {
      switch (detail[1]) {
        case 'equipos': {
          const team = await this.competition.teamDetail(id);
          return {
            title: team.name,
            description: `Conoce la plantilla de ${team.name} en ${team.divisionName}, temporada ${team.seasonName} de Rebel Crown Legacy.`
          };
        }
        case 'jugadores': {
          const player = await this.competition.playerDetail(id);
          const name = `${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''}`;
          return {
            title: name,
            description: `Consulta el perfil, los equipos y las estadísticas de ${name} en Rebel Crown Legacy.`
          };
        }
        case 'partidos': {
          const match = await this.competition.matchDetail(id);
          return {
            title: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            description: `${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}. Consulta los mapas y las estadísticas de esta serie de ${match.divisionName} en Rebel Crown Legacy.`
          };
        }
        case 'editorial': {
          if (!this.content) return fallback;
          const article = await this.content.article(id);
          return {
            title: article.title,
            description:
              article.excerpt.trim() ||
              `${article.title}. Lee el artículo de ${article.author} en Rebel Crown Legacy.`
          };
        }
      }
    } catch (error) {
      if ((error instanceof AppError && error.status === 404) || error instanceof ZodError)
        return getPageMetadata('/404');
      throw error;
    }
    return fallback;
  }
}
