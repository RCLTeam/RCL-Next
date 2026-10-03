export interface PageMetadata {
  title: string;
  description: string;
}

export const pageMetadataImage = 'https://rebelcrownlegacy.es/images/brand/rcl-logo.webp';

export const pageMetadata: Record<string, PageMetadata> = {
  '/': {
    title: 'Inicio',
    description:
      'Actualidad, partidos destacados y protagonistas de Rebel Crown Legacy. La corona no se hereda, se conquista.'
  },
  '/ligas': {
    title: 'Ligas',
    description:
      'Descubre las divisiones, el formato de competición y el camino hacia la corona de Rebel Crown Legacy.'
  },
  '/calendario': {
    title: 'Calendario',
    description:
      'Consulta los encuentros, las jornadas y los resultados de cada división de Rebel Crown Legacy.'
  },
  '/clasificacion': {
    title: 'Clasificación',
    description:
      'Sigue las victorias, los mapas y la posición de cada equipo en la fase regular de Rebel Crown Legacy.'
  },
  '/equipos': {
    title: 'Equipos',
    description: 'Conoce los equipos y sus plantillas en Rebel Crown Legacy.'
  },
  '/jugadores': {
    title: 'Jugadores',
    description:
      'Descubre los jugadores de Rebel Crown Legacy, sus estadísticas de temporada y el MVP de la jornada.'
  },
  '/campeones': {
    title: 'Campeones',
    description:
      'Consulta las selecciones y victorias de cada campeón en los mapas de Rebel Crown Legacy.'
  },
  '/fantasy': {
    title: 'Fantasy',
    description:
      'Construye tu quinteto Fantasy y sigue el rendimiento de tus jugadores favoritos de Rebel Crown Legacy.'
  },
  '/predicciones': {
    title: 'Predicciones',
    description:
      'Pronostica los resultados de cada jornada de Rebel Crown Legacy y suma puntos en la clasificación de predictores.'
  },
  '/bola-cristal': {
    title: 'Bola de Cristal',
    description:
      'Predice los campeones, el MVP y las sorpresas de la temporada de Rebel Crown Legacy.'
  },
  '/playoffs': {
    title: 'Playoffs',
    description: 'Sigue las eliminatorias y los resultados de los playoffs de Rebel Crown Legacy.'
  },
  '/admin': {
    title: 'Administración',
    description: 'Panel de administración de Rebel Crown Legacy.'
  },
  '/admin/home-content': {
    title: 'Contenido de la home',
    description: 'Gestiona los artículos y los equipos de la jornada de Rebel Crown Legacy.'
  },
  '/admin/rofl/upload': {
    title: 'Subida de repeticiones',
    description: 'Carga repeticiones ROFL para registrar las estadísticas de Rebel Crown Legacy.'
  },
  '/admin/crud': {
    title: 'Datos de competición',
    description: 'Administra temporadas, divisiones, equipos y encuentros de Rebel Crown Legacy.'
  },
  '/admin/member-roles': {
    title: 'Gestión de roles',
    description: 'Gestiona los roles y permisos de los miembros de Rebel Crown Legacy.'
  },
  '/admin/team-logos': {
    title: 'Logotipos de equipos',
    description: 'Administra los logotipos de los equipos de Rebel Crown Legacy.'
  },
  '/admin/database-transfer': {
    title: 'Transferencia de datos',
    description: 'Gestiona la importación y exportación de datos de Rebel Crown Legacy.'
  }
};

export function getPageMetadata(path: string): PageMetadata {
  const normalized = path.split('?')[0]?.replace(/\/$/, '') || '/';
  const exact = Object.hasOwn(pageMetadata, normalized) ? pageMetadata[normalized] : undefined;
  if (exact) return exact;
  const detail = /^\/(equipos|jugadores|partidos|editorial)\/[^/]+$/.exec(normalized);
  if (detail) {
    const descriptions: Record<string, PageMetadata> = {
      equipos: {
        title: 'Equipo',
        description: 'Plantilla y participación de este equipo en Rebel Crown Legacy.'
      },
      jugadores: {
        title: 'Jugador',
        description: 'Perfil, equipos y estadísticas de este jugador de Rebel Crown Legacy.'
      },
      partidos: {
        title: 'Partido',
        description: 'Resultado, mapas y estadísticas de esta serie de Rebel Crown Legacy.'
      },
      editorial: {
        title: 'Editorial',
        description: 'Noticias, reportajes y entrevistas de Rebel Crown Legacy.'
      }
    };
    const metadata = descriptions[detail[1] ?? ''];
    if (metadata) return metadata;
  }
  return {
    title: 'Página no encontrada',
    description: 'Esta página no está disponible en Rebel Crown Legacy.'
  };
}

export function renderPageMetadata(html: string, metadata: PageMetadata): string {
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
        character
    );
  const title = escapeHtml(`${metadata.title} · Rebel Crown Legacy`);
  const description = escapeHtml(metadata.description);
  return html.replace(
    /<!-- page-metadata:start -->[\s\S]*?<!-- page-metadata:end -->/,
    () => `<!-- page-metadata:start -->
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${pageMetadataImage}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${pageMetadataImage}" />
    <!-- page-metadata:end -->`
  );
}
