#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import struct
import sys
from typing import Any, Dict, List, Optional, Tuple, Union

OUTPUT_SUFFIX: str = "_estadisticas.json"
MAGIC_HEADER: bytes = b"RIOT"
MAX_METADATA_SIZE: int = 10 * 1024 * 1024  # 10 MB


def i(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def b(v: Any) -> bool:
    if isinstance(v, bool):
        return v

    if isinstance(v, str):
        return v.lower() in ("1", "true", "yes", "win")

    return bool(v)


def duration(s: Any) -> str:
    # gameLength de estos ROFL está expresado en milisegundos.
    s = i(s) // 1000

    return f"{s // 60}:{s % 60:02d}"


def first(d: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]

    return default


def read_rofl(path: Union[str, os.PathLike]) -> Dict[str, Any]:
    with open(path, "rb") as f:
        header = f.read(4)
        if header != MAGIC_HEADER:
            raise ValueError(
                f"Cabecera ROFL no reconocida: se esperaba {MAGIC_HEADER!r}, obtenido {header!r}"
            )

        f.seek(0, os.SEEK_END)
        total_size = f.tell()
        if total_size < 8:
            raise ValueError("Archivo ROFL demasiado pequeño")

        f.seek(-4, os.SEEK_END)
        tail = f.read(4)
        if len(tail) != 4:
            raise ValueError("No se pudo leer el trailer de metadata")

        (n,) = struct.unpack("<I", tail)
        if n <= 0 or n > MAX_METADATA_SIZE:
            raise ValueError(f"Longitud de metadata inválida: {n}")

        if total_size < 4 + n + 4:
            raise ValueError("Longitud de metadata inválida: excede el tamaño del archivo")

        f.seek(-4 - n, os.SEEK_END)
        payload = f.read(n)
        if len(payload) != n:
            raise ValueError("No se pudieron leer todos los bytes de metadata")

    meta = json.loads(payload.decode("utf-8"))
    if not isinstance(meta, dict):
        raise ValueError("Metadata inválida")

    return meta


def runes(p: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "primaria": {
            "estilo_id": i(p.get("PERK_PRIMARY_STYLE")),
            "keystone_id": i(p.get("PERK0")),
            "runa_1_id": i(p.get("PERK1")),
            "runa_2_id": i(p.get("PERK2")),
            "runa_3_id": i(p.get("PERK3")),
        },
        "secundaria": {
            "estilo_id": i(p.get("PERK_SUB_STYLE")),
            "runa_1_id": i(p.get("PERK4")),
            "runa_2_id": i(p.get("PERK5")),
        },
        "fragmentos": {
            "ofensiva_id": i(p.get("STAT_PERK_0")),
            "flexible_id": i(p.get("STAT_PERK_1")),
            "defensiva_id": i(p.get("STAT_PERK_2")),
        },
    }


def items(p: Dict[str, Any]) -> Dict[str, List[Dict[str, int]]]:
    return {
        "slots": [
            {
                "slot": n,
                "id": i(p.get(f"ITEM{n}")),
            }
            for n in range(7)
        ],
    }


def player(p: Dict[str, Any]) -> Dict[str, Any]:
    name = first(
        p,
        "RIOT_ID_GAME_NAME",
        "NAME",
        default="",
    )

    tag = first(
        p,
        "RIOT_ID_TAG_LINE",
        default="",
    )

    return {
        "nombre": name,
        "tag": tag,
        "riot_id": f"{name}#{tag}" if tag else name,
        "puuid": p.get("PUUID"),

        "campeon": p.get("SKIN"),

        "posicion": first(
            p,
            "INDIVIDUAL_POSITION",
            "TEAM_POSITION",
            "PLAYER_POSITION",
            "PLAYER_ROLE",
        ),

        "equipo": i(p.get("TEAM")),
        "resultado": "Win" if b(p.get("WIN")) else "Lose",

        "kda": {
            "kills": i(p.get("CHAMPIONS_KILLED")),
            "muertes": i(p.get("NUM_DEATHS")),
            "asistencias": i(p.get("ASSISTS")),
            "double_kills": i(p.get("DOUBLE_KILLS")),
            "triple_kills": i(p.get("TRIPLE_KILLS")),
            "quadra_kills": i(p.get("QUADRA_KILLS")),
            "penta_kills": i(p.get("PENTA_KILLS")),
            "largest_killing_spree": i(p.get("LARGEST_KILLING_SPREE")),
        },

        "oro": i(p.get("GOLD_EARNED")),
        "cs": i(p.get("MINIONS_KILLED")) + i(p.get("NEUTRAL_MINIONS_KILLED")),
        "nivel": i(p.get("LEVEL")),
        "daño_campeones": i(p.get("TOTAL_DAMAGE_DEALT_TO_CHAMPIONS")),
        "daño_recibido_campeones": i(p.get("TOTAL_DAMAGE_TAKEN_FROM_CHAMPIONS")),

        "soporte": {
            "daño_mitigado": i(p.get("TOTAL_DAMAGE_SELF_MITIGATED")),
            "control_adversarios": i(p.get("TOTAL_TIME_CROWD_CONTROL_DEALT_TO_CHAMPIONS")),
        },

        "estructuras": {
            "torres": i(p.get("TURRETS_KILLED")),
            "derribos_torres": i(p.get("TURRET_TAKEDOWNS")),
            "inhibidores": i(p.get("BARRACKS_KILLED")),
            "derribos_inhibidores": i(p.get("BARRACKS_TAKEDOWNS")),
        },

        "vision": {
            "score": i(p.get("VISION_SCORE")),
            "wards_colocados": i(p.get("WARD_PLACED")),
            "wards_destruidos": i(p.get("WARD_KILLED")),
            "pinkwards_comprados": i(p.get("VISION_WARDS_BOUGHT_IN_GAME")),
            "wards_detector": i(p.get("WARD_PLACED_DETECTOR")),
        },

        "pings": i(p.get("PING")),

        "runas": runes(p),
        "objetos": items(p),

        "hechizos": {
            "hechizo_1_id": i(p.get("SUMMONER_SPELL_1")),
            "hechizo_2_id": i(p.get("SUMMONER_SPELL_2")),
            "casts_1": i(p.get("SUMMON_SPELL1_CAST")),
            "casts_2": i(p.get("SUMMON_SPELL2_CAST")),
        },

        "monstruos": {
            "dragones": i(p.get("DRAGON_KILLS")),
            "barones": i(p.get("BARON_KILLS")),
            "heraldos": i(p.get("RIFT_HERALD_KILLS")),
            "void_grubs": i(p.get("HORDE_KILLS")),
            "elder_dragons": i(p.get("ELDER_DRAGON_KILLS")),
            "objetivos_robados": i(p.get("OBJECTIVES_STOLEN")),
            "asistencias_robo": i(p.get("OBJECTIVES_STOLEN_ASSISTS")),
        },

        "gameplay": {
            "mayor_daño_habilidad": i(p.get("LARGEST_ABILITY_DAMAGE")),
            "mayor_daño_ataque": i(p.get("LARGEST_ATTACK_DAMAGE")),
            "mayor_critico": i(p.get("LARGEST_CRITICAL_STRIKE")),
            "tiempo_vivo_mas_largo": i(p.get("LONGEST_TIME_SPENT_LIVING")),
            "tiempo_muerto": i(p.get("TOTAL_TIME_SPENT_DEAD")),
        },
    }


def team(team_id: int, ps: List[Dict[str, Any]]) -> Dict[str, Any]:
    victory = any(
        p["resultado"] == "Win"
        for p in ps
    )

    # Los contadores de objetivos individuales pueden
    # contar créditos personales, por lo que se mantienen
    # como métricas agregadas solo cuando son naturalmente
    # aditivos.
    return {
        "victoria": victory,

        "resumen": {
            "kills": sum(p["kda"]["kills"] for p in ps),
            "muertes": sum(p["kda"]["muertes"] for p in ps),
            "asistencias": sum(p["kda"]["asistencias"] for p in ps),
            "oro_total": sum(p["oro"] for p in ps),
            "daño_campeones": sum(p["daño_campeones"] for p in ps),
            "daño_recibido_campeones": sum(p["daño_recibido_campeones"] for p in ps),
        },

        "objetivos": {
            "dragones": sum(p["monstruos"]["dragones"] for p in ps),
            "barones": sum(p["monstruos"]["barones"] for p in ps),
            "heraldos": sum(p["monstruos"]["heraldos"] for p in ps),
            "void_grubs": sum(p["monstruos"]["void_grubs"] for p in ps),
            "elder_dragons": sum(p["monstruos"]["elder_dragons"] for p in ps),
            "inhibidores": sum(p["estructuras"]["inhibidores"] for p in ps),
        },

        "jugadores": [p["riot_id"] for p in ps],
    }


def parse_rofl(
    path: Union[str, os.PathLike],
    output_path: Optional[Union[str, os.PathLike]] = None,
    quiet: bool = False,
) -> Dict[str, Any]:
    meta = read_rofl(path)

    stats_json_str = meta.get("statsJson")
    if not stats_json_str:
        raise ValueError("No se encontró statsJson")

    raw = json.loads(stats_json_str)
    if not isinstance(raw, list) or not raw:
        raise ValueError("No se encontró statsJson")

    players = [
        player(x)
        for x in raw
    ]

    ids = sorted(
        set(
            p["equipo"]
            for p in players
        )
    )

    teams = {
        str(t): team(
            t,
            [
                p
                for p in players
                if p["equipo"] == t
            ],
        )
        for t in ids
    }

    winner = next(
        (
            int(t)
            for t, v in teams.items()
            if v["victoria"]
        ),
        None,
    )

    out = {
        "version": 2,

        "fuente": {
            "tipo": "rofl",
            "archivo": os.path.basename(path),
        },

        "rofl": {
            "game_length_raw": i(
                meta.get("gameLength")
            ),
            "last_game_chunk_id": i(
                meta.get("lastGameChunkId")
            ),
            "last_key_frame_id": i(
                meta.get("lastKeyFrameId")
            ),
        },

        "partida": {
            "duracion": i(
                meta.get("gameLength")
            ) // 1000,

            "duracion_formateada": duration(
                meta.get("gameLength")
            ),

            "equipo_ganador": winner,
        },

        "equipos": teams,
        "jugadores": players,

        "nota": (
            "Los campos timeline/eventos/first_blood "
            "no se inventan: statsJson no los contiene. "
            "Los IDs de campeones, objetos, runas y "
            "hechizos deben resolverse contra datos de "
            "LoL (p.ej. Data Dragon)."
        ),
    }

    if output_path is None:
        base, _ = os.path.splitext(path)
        outpath = base + OUTPUT_SUFFIX
    else:
        outpath = os.fspath(output_path)

    outdir = os.path.dirname(outpath)
    if outdir and not os.path.exists(outdir):
        os.makedirs(outdir, exist_ok=True)

    with open(
        outpath,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            out,
            f,
            ensure_ascii=False,
            indent=2,
        )

    if not quiet:
        print(f"Estadísticas extraídas exitosamente: {outpath}")

    return out


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extractor de estadísticas de repeticiones ROFL de League of Legends."
    )
    parser.add_argument(
        "path",
        help="Ruta al archivo .rofl de entrada",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="Ruta personalizada para el archivo JSON de salida (por defecto: <nombre>_estadisticas.json)",
    )
    parser.add_argument(
        "-q",
        "--quiet",
        action="store_true",
        help="Suprimir mensajes informativos en consola",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not os.path.isfile(args.path):
        sys.stderr.write(f"Error: El archivo no existe o no es válido: {args.path}\n")
        return 1

    try:
        parse_rofl(args.path, output_path=args.output, quiet=args.quiet)
        return 0
    except Exception as e:
        sys.stderr.write(f"Error al procesar el archivo: {e}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())

