import type { GameAsset, GameCatalog } from './riot-assets.types.js';

// Verified paths: https://communitydragon.org/documentation/assets
const POSITIONS_CDN =
  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions';

const positions = [
  { name: 'TOP', file: 'top', aliases: ['TOP'] },
  { name: 'JUNGLE', file: 'jungle', aliases: ['JUNGLE', 'JGL'] },
  { name: 'MID', file: 'middle', aliases: ['MID', 'MIDDLE'] },
  { name: 'ADC', file: 'bottom', aliases: ['ADC', 'BOT', 'BOTTOM'] },
  { name: 'SUPPORT', file: 'utility', aliases: ['SUPPORT', 'SUP', 'UTILITY'] }
];

// Public static assets need no JSON request or Data Dragon version lookup.
export const positionAssets: GameCatalog = Object.fromEntries(
  positions.flatMap(({ name, file, aliases }) =>
    aliases.map((alias) => [
      `position:${alias}`,
      { name, image: `${POSITIONS_CDN}/icon-position-${file}.png` }
    ])
  )
);

export function getPositionAsset(position: string | null): GameAsset {
  return positionAssets[`position:${position?.trim().toUpperCase()}`] ?? { name: 'Sin posición' };
}
