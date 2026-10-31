# Recursos de Riot

- `data-dragon.service.ts`: versión, catálogos en español, campeones, objetos, hechizos y árboles de runas de Data Dragon. Comparte solicitudes y permite reintentar cargas fallidas o parciales.
- `community-dragon.service.ts`: iconos de posiciones y sus alias.
- `champion-art.service.ts`: metadatos de skins y variantes de splash original, centrado, retrato y tarjeta desde CommunityDragon; caché por campeón y reintento tras fallos. Valida la respuesta antes de leer sus propiedades.
- `stat-shards.ts`: fragmentos de estadísticas, sus identificadores y recursos de Community Dragon. Disponibles sin cargar Data Dragon.
- `riot-assets.types.ts`: contratos comunes del catálogo.
- `riot-assets.service.ts`: entrada común para consultar recursos, árboles, fragmentos y arte de skins; exporta los contratos `ChampionSkinArt` y `ChampionArtVariant`, `loadChampionArt` y `selectChampionArt`.
- `useGameCatalog.ts`: integración React con limpieza al desmontar.
- `useChampionArt.ts`: resuelve las fuentes de imagen y mantiene la consulta fuera del componente visual. El original base usa el splash de Data Dragon sin consultar CommunityDragon. Las otras variantes esperan los metadatos antes de iniciar la imagen alternativa; un fallo de metadatos permite usar el splash base. Ignora respuestas de campeones anteriores y tras desmontar.
- `GameIcon.tsx` y `game-icon.css`: presentación y texto alternativo si falla una imagen.
- `ChampionArt.tsx`: presentación de splash arts con alternativas progresivas, conservando el nodo de imagen al cambiar de fuente. Si se agotan, devuelve `null` para mostrar el respaldo de la tarjeta. Los iconos cuadrados quedan excluidos de estas fuentes.
- `*.test.ts*`: pruebas de carga, caché, fallos y resolución de recursos.

Consumir el catálogo desde `riot-assets.service.ts` o `useGameCatalog.ts`, y el arte desde `ChampionArt` o `useChampionArt`. `skinId` es el identificador completo de Riot (por ejemplo, `103001`), no el número de skin de Data Dragon; una skin desconocida usa la base. Las exportaciones de fragmentos en `data-dragon.service.ts` se conservan por compatibilidad.

Fuentes:

- Data Dragon: https://ddragon.leagueoflegends.com/api/versions.json.
- CommunityDragon: https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json y `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/{id}.json`.
