import type { GameCatalog, StatShardSlot } from './riot-assets.types.js';

const CDRAGON_PERKS =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods';
export const statShardAssets: GameCatalog = {
  'rune:5001': { name: 'Vida por nivel', image: `${CDRAGON_PERKS}/statmodshealthplusicon.png` },
  'rune:5002': { name: 'Armadura', image: `${CDRAGON_PERKS}/statmodsarmoricon.png` },
  'rune:5003': { name: 'Resistencia mágica', image: `${CDRAGON_PERKS}/statmodsmagicresicon.png` },
  'rune:5008': {
    name: 'Fuerza adaptable',
    image: `${CDRAGON_PERKS}/statmodsadaptiveforceicon.png`
  },
  'rune:5005': {
    name: 'Velocidad de ataque',
    image: `${CDRAGON_PERKS}/statmodsattackspeedicon.png`
  },
  'rune:5007': {
    name: 'Velocidad de habilidades',
    image: `${CDRAGON_PERKS}/statmodscdrscalingicon.png`
  },
  'rune:5010': {
    name: 'Velocidad de movimiento',
    image: `${CDRAGON_PERKS}/statmodsmovementspeedicon.png`
  },
  'rune:5011': { name: 'Vida plana', image: `${CDRAGON_PERKS}/statmodshealthscalingicon.png` },
  'rune:5013': {
    name: 'Tenacidad y Resistencia a lentitud',
    image: `${CDRAGON_PERKS}/statmodstenacityicon.png`
  }
};
export const STAT_SHARD_SLOTS: StatShardSlot[] = [
  {
    name: 'Ofensa',
    runes: [
      {
        id: 5008,
        name: 'Fuerza adaptable',
        key: 'StatModAdaptive',
        icon: `${CDRAGON_PERKS}/statmodsadaptiveforceicon.png`
      },
      {
        id: 5005,
        name: 'Velocidad de ataque',
        key: 'StatModAttackSpeed',
        icon: `${CDRAGON_PERKS}/statmodsattackspeedicon.png`
      },
      {
        id: 5007,
        name: 'Velocidad de habilidades',
        key: 'StatModCDR',
        icon: `${CDRAGON_PERKS}/statmodscdrscalingicon.png`
      }
    ]
  },
  {
    name: 'Flex',
    runes: [
      {
        id: 5008,
        name: 'Fuerza adaptable',
        key: 'StatModAdaptive',
        icon: `${CDRAGON_PERKS}/statmodsadaptiveforceicon.png`
      },
      {
        id: 5010,
        name: 'Velocidad de movimiento',
        key: 'StatModMovementSpeed',
        icon: `${CDRAGON_PERKS}/statmodsmovementspeedicon.png`
      },
      {
        id: 5001,
        name: 'Vida por nivel',
        key: 'StatModHealthScaling',
        icon: `${CDRAGON_PERKS}/statmodshealthplusicon.png`
      }
    ]
  },
  {
    name: 'Defensa',
    runes: [
      {
        id: 5011,
        name: 'Vida plana (+65)',
        key: 'StatModHealth',
        icon: `${CDRAGON_PERKS}/statmodshealthscalingicon.png`
      },
      {
        id: 5013,
        name: 'Tenacidad y lentitud (+15%)',
        key: 'StatModTenacity',
        icon: `${CDRAGON_PERKS}/statmodstenacityicon.png`
      },
      {
        id: 5001,
        name: 'Vida por nivel',
        key: 'StatModHealthScaling',
        icon: `${CDRAGON_PERKS}/statmodshealthplusicon.png`
      }
    ]
  }
];
