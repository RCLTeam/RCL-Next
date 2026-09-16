import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ParsedGameData,
  ParsedParticipantData,
  ParticipantBuild,
  ParticipantRunes
} from '../types/roflUpload.types.js';

function getField(source: unknown, dotPath: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return dotPath.split('.').reduce<unknown>((value, key) => {
    if (typeof value === 'object' && value !== null) {
      return Reflect.get(value, key);
    }
    return undefined;
  }, source);
}

function getNumber(source: unknown, dotPath: string, defaultValue = 0): number {
  const val = getField(source, dotPath);
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const parsed = Number(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

function getString(source: unknown, dotPath: string, defaultValue = ''): string {
  const val = getField(source, dotPath);
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return defaultValue;
}

function extractParticipantRunes(p: unknown): ParticipantRunes {
  return {
    primaryKeystoneId: getNumber(p, 'runas.primaria.keystone_id'),
    primaryPerk: getNumber(p, 'runas.primaria.estilo_id'),
    primaryPerk1: getNumber(p, 'runas.primaria.runa_1_id'),
    primaryPerk2: getNumber(p, 'runas.primaria.runa_2_id'),
    primaryPerk3: getNumber(p, 'runas.primaria.runa_3_id'),
    secundaryRuneId: getNumber(p, 'runas.secundaria.estilo_id'),
    secundaryPerk1: getNumber(p, 'runas.secundaria.runa_1_id'),
    secundaryPerk2: getNumber(p, 'runas.secundaria.runa_2_id'),
    statPerkOffense: getNumber(p, 'runas.fragmentos.ofensiva_id'),
    statPerkFlex: getNumber(p, 'runas.fragmentos.flexible_id'),
    statPerkDefense: getNumber(p, 'runas.fragmentos.defensiva_id')
  };
}

function extractParticipantBuild(p: unknown): ParticipantBuild {
  const rawSlots = getField(p, 'objetos.slots');
  const slotMap = new Map<number, number>();

  if (Array.isArray(rawSlots)) {
    for (const slot of rawSlots) {
      if (typeof slot === 'object' && slot !== null) {
        const slotIdx = Reflect.get(slot, 'slot');
        const id = Reflect.get(slot, 'id');
        if (typeof slotIdx === 'number' && typeof id === 'number') {
          slotMap.set(slotIdx, id);
        }
      }
    }
  }

  const s1 = getField(p, 'hechizos.hechizo_1_id');
  const s2 = getField(p, 'hechizos.hechizo_2_id');

  return {
    item0: slotMap.get(0) ?? 0,
    item1: slotMap.get(1) ?? 0,
    item2: slotMap.get(2) ?? 0,
    item3: slotMap.get(3) ?? 0,
    item4: slotMap.get(4) ?? 0,
    item5: slotMap.get(5) ?? 0,
    trinket: slotMap.get(6) ?? 0,
    summonerSpell1Id: typeof s1 === 'number' ? s1 : null,
    summonerSpell2Id: typeof s2 === 'number' ? s2 : null
  };
}

function extractExtraStats(p: unknown): Record<string, number | null | boolean> {
  return {
    doubleKills: getNumber(p, 'kda.double_kills'),
    tripleKills: getNumber(p, 'kda.triple_kills'),
    quadraKills: getNumber(p, 'kda.quadra_kills'),
    pentaKills: getNumber(p, 'kda.penta_kills'),
    largestKillingSpree: getNumber(p, 'kda.largest_killing_spree'),
    goldEarned: getNumber(p, 'oro'),
    level: getNumber(p, 'nivel'),
    damageTakenFromChampions: getNumber(p, 'daño_recibido_campeones'),
    damageMitigated: getNumber(p, 'soporte.daño_mitigado'),
    crowdControlTime: getNumber(p, 'soporte.control_adversarios'),
    turretsKilled: getNumber(p, 'estructuras.torres'),
    turretTakedowns: getNumber(p, 'estructuras.derribos_torres'),
    inhibitorsKilled: getNumber(p, 'estructuras.inhibidores'),
    inhibitorTakedowns: getNumber(p, 'estructuras.derribos_inhibidores'),
    wardsPlaced: getNumber(p, 'vision.wards_colocados'),
    wardsDestroyed: getNumber(p, 'vision.wards_destruidos'),
    controlWardsPurchased: getNumber(p, 'vision.pinkwards_comprados'),
    detectorWardsPlaced: getNumber(p, 'vision.wards_detector'),
    pings: getNumber(p, 'pings'),
    summonerSpell1Casts: getNumber(p, 'hechizos.casts_1'),
    summonerSpell2Casts: getNumber(p, 'hechizos.casts_2'),
    dragonsKilled: getNumber(p, 'monstruos.dragones'),
    baronsKilled: getNumber(p, 'monstruos.barones'),
    riftHeraldsKilled: getNumber(p, 'monstruos.heraldos'),
    voidGrubsKilled: getNumber(p, 'monstruos.void_grubs'),
    elderDragonsKilled: getNumber(p, 'monstruos.elder_dragons'),
    objectivesStolen: getNumber(p, 'monstruos.objetivos_robados'),
    objectivesStolenAssists: getNumber(p, 'monstruos.asistencias_robo'),
    largestAbilityDamage: getNumber(p, 'gameplay.mayor_daño_habilidad'),
    largestAttackDamage: getNumber(p, 'gameplay.mayor_daño_ataque'),
    largestCriticalStrike: getNumber(p, 'gameplay.mayor_critico'),
    longestTimeLiving: getNumber(p, 'gameplay.tiempo_vivo_mas_largo'),
    timeSpentDead: getNumber(p, 'gameplay.tiempo_muerto'),
    isMvp: false
  };
}

export function transformParticipant(p: unknown): ParsedParticipantData {
  let gameName = getString(p, 'nombre');
  let riotTag = getString(p, 'tag');

  if (!gameName && !riotTag) {
    const riotId = getString(p, 'riot_id');
    if (riotId.includes('#')) {
      const parts = riotId.split('#');
      gameName = parts[0] ?? '';
      riotTag = parts[1] ?? '';
    } else {
      gameName = riotId;
    }
  }

  const teamNumber = getNumber(p, 'equipo', 100);
  const side: 'blue' | 'red' = teamNumber === 100 ? 'blue' : 'red';
  const champion = getString(p, 'campeon', 'Unknown');
  const position = getString(p, 'posicion', 'UNKNOWN');
  const kills = getNumber(p, 'kda.kills');
  const deaths = getNumber(p, 'kda.muertes');
  const assists = getNumber(p, 'kda.asistencias');
  const cs = getNumber(p, 'cs');
  const damageToChampions = getNumber(p, 'daño_campeones');

  const visionVal = getField(p, 'vision.score');
  const visionScore = typeof visionVal === 'number' ? visionVal : null;

  return {
    gameName,
    riotTag,
    side,
    champion,
    position,
    kills,
    deaths,
    assists,
    cs,
    damageToChampions,
    visionScore,
    extraStats: extractExtraStats(p),
    runes: extractParticipantRunes(p),
    build: extractParticipantBuild(p)
  };
}

export function transformSingleParserJson(raw: unknown, sourceFileName?: string): ParsedGameData {
  const rawFileName = getString(raw, 'fuente.archivo');
  const fileName =
    rawFileName ||
    (sourceFileName
      ? path.basename(sourceFileName).replace(/_estadisticas\.json$/i, '.rofl')
      : 'unknown.rofl');

  const baseGameId = fileName
    .replace(/\.rofl$/i, '')
    .replace(/_estadisticas\.json$/i, '')
    .replace(/\.json$/i, '');

  const explicitExternalId = getString(raw, 'externalGameId') || getString(raw, 'gameId');
  const externalGameId = explicitExternalId || baseGameId;

  const durationSeconds =
    getNumber(raw, 'partida.duracion') || Math.floor(getNumber(raw, 'rofl.game_length_raw') / 1000);

  const winningTeam = getNumber(raw, 'partida.equipo_ganador');
  const isBlueWin = winningTeam === 100 || Boolean(getField(raw, 'equipos.100.victoria'));
  const winnerSide: 'blue' | 'red' = isBlueWin ? 'blue' : 'red';

  const rawPlayers = getField(raw, 'jugadores');
  const participants: ParsedParticipantData[] = Array.isArray(rawPlayers)
    ? rawPlayers.map((p) => transformParticipant(p))
    : [];

  const rawCreation = getField(raw, 'gameCreation') ?? getField(raw, 'rofl.gameCreation');
  const gameCreation = typeof rawCreation === 'number' ? rawCreation : undefined;

  return {
    fileName,
    externalGameId,
    durationSeconds,
    winnerSide,
    participants,
    ...(gameCreation !== undefined ? { gameCreation } : {})
  };
}

export function sortGamesChronologically(games: ParsedGameData[]): ParsedGameData[] {
  return [...games].sort((a, b) => {
    if (
      a.gameCreation !== undefined &&
      b.gameCreation !== undefined &&
      a.gameCreation !== b.gameCreation
    ) {
      return a.gameCreation - b.gameCreation;
    }
    return a.fileName.localeCompare(b.fileName, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  });
}

export async function transformParserJson(jsonFilePaths: string[]): Promise<ParsedGameData[]> {
  const games: ParsedGameData[] = [];

  for (const filePath of jsonFilePaths) {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    const gameData = transformSingleParserJson(parsed, path.basename(filePath));
    games.push(gameData);
  }

  return sortGamesChronologically(games);
}
