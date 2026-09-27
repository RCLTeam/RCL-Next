# Recursos de Riot

- `data-dragon.service.ts`: versión, catálogos en español, campeones, objetos, hechizos y árboles de runas de Data Dragon. Comparte solicitudes y permite reintentar cargas fallidas o parciales.
- `community-dragon.service.ts`: iconos de posiciones y sus alias.
- `stat-shards.ts`: fragmentos de estadísticas, sus identificadores y recursos de Community Dragon. Disponibles sin cargar Data Dragon.
- `riot-assets.types.ts`: contratos comunes del catálogo.
- `riot-assets.service.ts`: entrada para consultar recursos, árboles y fragmentos; combina ambos proveedores y mantiene recursos locales si falla la red.
- `useGameCatalog.ts`: integración React con limpieza al desmontar.
- `GameIcon.tsx` y `game-icon.css`: presentación y texto alternativo si falla una imagen.
- `*.test.ts*`: pruebas de carga, caché, fallos y resolución de recursos.

Consumir el catálogo desde `riot-assets.service.ts` o `useGameCatalog.ts`. Las exportaciones de fragmentos en `data-dragon.service.ts` se conservan por compatibilidad.

Fuentes: https://ddragon.leagueoflegends.com/api/versions.json y https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json.
