#!/usr/bin/env python3

import sys
import os
import json
import struct

OUTPUT_SUFFIX = "_estadisticas.json"

def i(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def b(v):
    if isinstance(v, bool):
        return v

    if isinstance(v, str):
        return v.lower() in ("1", "true", "yes", "win")

    return bool(v)


def duration(s):
    # gameLength de estos ROFL está expresado en milisegundos.
    s = i(s) // 1000

    return f"{s // 60}:{s % 60:02d}"


def first(d, *keys, default=None):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]

    return default


def read_rofl(path):
    with open(path, "rb") as f:
        data = f.read()

    if len(data) < 4:
        raise ValueError("ROFL demasiado pequeño")

    n = struct.unpack("<I", data[-4:])[0]
    start = len(data) - 4 - n

    if start < 0:
        raise ValueError("Longitud de metadata inválida")

    meta = json.loads(
        data[start:-4].decode("utf-8")
    )

    if not isinstance(meta, dict):
        raise ValueError("Metadata inválida")

    return meta


def runes(p):
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
        "variables": {
            f"perk{n}": {
                "var1": i(p.get(f"PERK{n}_VAR1")),
                "var2": i(p.get(f"PERK{n}_VAR2")),
                "var3": i(p.get(f"PERK{n}_VAR3")),
            }
            for n in range(6)
        },
    }


def items(p):
    return {
        "slots": [
            {
                "slot": n,
                "id": i(p.get(f"ITEM{n}")),
            }
            for n in range(7)
        ],
        "comprados": i(p.get("ITEMS_PURCHASED")),
        "consumibles_comprados": i(
            p.get("CONSUMABLES_PURCHASED")
        ),
        "oro_gastado": i(p.get("GOLD_SPENT")),
    }


def player(p):
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
            "killing_sprees": i(p.get("KILLING_SPREES")),
            "largest_killing_spree": i(p.get("LARGEST_KILLING_SPREE")),
        },

        "economia": {
            "oro": i(p.get("GOLD_EARNED")),
            "oro_gastado": i(p.get("GOLD_SPENT")),
        },

        "farm": {
            "cs": i(p.get("MINIONS_KILLED")),
            "neutrales": i(
                p.get("NEUTRAL_MINIONS_KILLED")
            ),
            "jungla_propia": i(
                p.get("NEUTRAL_MINIONS_KILLED_YOUR_JUNGLE")
            ),
            "jungla_enemiga": i(
                p.get("NEUTRAL_MINIONS_KILLED_ENEMY_JUNGLE")
            ),
        },

        "nivel": i(p.get("LEVEL")),

        "daño": {
            "total": i(p.get("TOTAL_DAMAGE_DEALT")),
            "campeones": i(
                p.get("TOTAL_DAMAGE_DEALT_TO_CHAMPIONS")
            ),
            "estructuras": i(
                p.get("TOTAL_DAMAGE_DEALT_TO_BUILDINGS")
            ),
            "torres": i(
                p.get("TOTAL_DAMAGE_DEALT_TO_TURRETS")
            ),
            "objetivos": i(
                p.get("TOTAL_DAMAGE_DEALT_TO_OBJECTIVES")
            ),
            "monstruos_epicos": i(
                p.get("TOTAL_DAMAGE_DEALT_TO_EPIC_MONSTERS")
            ),
            "fisico": i(
                p.get("PHYSICAL_DAMAGE_DEALT_PLAYER")
            ),
            "fisico_campeones": i(
                p.get("PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS")
            ),
            "magico": i(
                p.get("MAGIC_DAMAGE_DEALT_PLAYER")
            ),
            "magico_campeones": i(
                p.get("MAGIC_DAMAGE_DEALT_TO_CHAMPIONS")
            ),
            "verdadero": i(
                p.get("TRUE_DAMAGE_DEALT_PLAYER")
            ),
            "verdadero_campeones": i(
                p.get("TRUE_DAMAGE_DEALT_TO_CHAMPIONS")
            ),
        },

        "daño_recibido": {
            "total": i(p.get("TOTAL_DAMAGE_TAKEN")),
            "campeones": i(
                p.get("TOTAL_DAMAGE_TAKEN_FROM_CHAMPIONS")
            ),
            "estructuras": i(
                p.get("TOTAL_DAMAGE_TAKEN_FROM_BUILDINGS")
            ),
            "fisico": i(
                p.get("PHYSICAL_DAMAGE_TAKEN")
            ),
            "magico": i(
                p.get("MAGIC_DAMAGE_TAKEN")
            ),
            "verdadero": i(
                p.get("TRUE_DAMAGE_TAKEN")
            ),
        },

        "soporte": {
            "daño_mitigado": i(
                p.get("TOTAL_DAMAGE_SELF_MITIGATED")
            ),
            "daño_curado": i(
                p.get("TOTAL_HEAL")
            ),
            "curacion_a_compañeros": i(
                p.get("TOTAL_HEAL_ON_TEAMMATES")
            ),
            "daño_escudado_a_compañeros": i(
                p.get("TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES")
            ),
            "unidades_curadas": i(
                p.get("TOTAL_UNITS_HEALED")
            ),
            "control_adversarios": i(
                p.get("TOTAL_TIME_CROWD_CONTROL_DEALT_TO_CHAMPIONS")
            ),
        },

        "estructuras": {
            "torres": i(p.get("TURRETS_KILLED")),
            "derribos_torres": i(
                p.get("TURRET_TAKEDOWNS")
            ),
            "inhibidores": i(
                p.get("BARRACKS_KILLED")
            ),
            "derribos_inhibidores": i(
                p.get("BARRACKS_TAKEDOWNS")
            ),
        },

        "vision": {
            "score": i(p.get("VISION_SCORE")),
            "wards_colocados": i(p.get("WARD_PLACED")),
            "wards_destruidos": i(p.get("WARD_KILLED")),
            "pinkwards_comprados": i(
                p.get("VISION_WARDS_BOUGHT_IN_GAME")
            ),
            "wards_detector": i(
                p.get("WARD_PLACED_DETECTOR")
            ),
        },

        "pings": {
            "total": i(p.get("PING")),
            "basic": i(p.get("BASIC_PINGS")),
            "command": i(p.get("COMMAND_PINGS")),
            "danger": i(p.get("DANGER_PINGS")),
            "enemy_missing": i(p.get("ENEMY_MISSING_PINGS")),
            "enemy_vision": i(p.get("ENEMY_VISION_PINGS")),
            "get_back": i(p.get("GET_BACK_PINGS")),
            "hold": i(p.get("HOLD_PINGS")),
            "on_my_way": i(p.get("ON_MY_WAY_PINGS")),
            "push": i(p.get("PUSH_PINGS")),
            "retreat": i(p.get("RETREAT_PINGS")),
            "vision_cleared": i(p.get("VISION_CLEARED_PINGS")),
            "need_vision": i(p.get("NEED_VISION_PINGS")),
            "all_in": i(p.get("ALL_IN_PINGS")),
            "assist_me": i(p.get("ASSIST_ME_PINGS")),
        },

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
            "atakhans": i(p.get("ATAKHAN_KILLS")),
            "objetivos_robados": i(p.get("OBJECTIVES_STOLEN")),
            "asistencias_robo": i(p.get("OBJECTIVES_STOLEN_ASSISTS")),
        },

        "gameplay": {
            "mayor_daño_habilidad": i(p.get("LARGEST_ABILITY_DAMAGE")),
            "mayor_daño_ataque": i(p.get("LARGEST_ATTACK_DAMAGE")),
            "mayor_critico": i(p.get("LARGEST_CRITICAL_STRIKE")),
            "tiempo_vivo_mas_largo": i(p.get("LONGEST_TIME_SPENT_LIVING")),
            "tiempo_muerto": i(p.get("TOTAL_TIME_SPENT_DEAD")),
            "tiempo_desconectado": i(p.get("TIME_SPENT_DISCONNECTED")),
            "ultimo_takedown_tiempo": i(p.get("LAST_TAKEDOWN_TIME")),
        },
    }


def team(team_id, ps):
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
            "kills": sum(
                p["kda"]["kills"]
                for p in ps
            ),
            "muertes": sum(
                p["kda"]["muertes"]
                for p in ps
            ),
            "asistencias": sum(
                p["kda"]["asistencias"]
                for p in ps
            ),
            "oro_total": sum(
                p["economia"]["oro"]
                for p in ps
            ),
            "daño_campeones": sum(
                p["daño"]["campeones"]
                for p in ps
            ),
            "daño_recibido_campeones": sum(
                p["daño_recibido"]["campeones"]
                for p in ps
            ),
        },

        "objetivos": {
            "dragones": sum(
                p["monstruos"]["dragones"]
                for p in ps
            ),
            "barones": sum(
                p["monstruos"]["barones"]
                for p in ps
            ),
            "heraldos": sum(
                p["monstruos"]["heraldos"]
                for p in ps
            ),
            "void_grubs": sum(
                p["monstruos"]["void_grubs"]
                for p in ps
            ),
            "elder_dragons": sum(
                p["monstruos"]["elder_dragons"]
                for p in ps
            ),
            "atakhans": sum(
                p["monstruos"]["atakhans"]
                for p in ps
            ),
            "inhibidores": sum(
                p["estructuras"]["inhibidores"]
                for p in ps
            ),
        },

        "jugadores": [
            p["riot_id"]
            for p in ps
        ],
    }


def main(path):
    meta = read_rofl(path)

    raw = json.loads(
        meta.get("statsJson", "[]")
    )

    if not raw:
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

        "graficas": {
            "daño_por_jugador": [
                {
                    "jugador": p["riot_id"],
                    "equipo": p["equipo"],
                    "valor": p["daño"]["campeones"],
                }
                for p in players
            ],

            "oro_por_jugador": [
                {
                    "jugador": p["riot_id"],
                    "equipo": p["equipo"],
                    "valor": p["economia"]["oro"],
                }
                for p in players
            ],

            "cs_por_jugador": [
                {
                    "jugador": p["riot_id"],
                    "equipo": p["equipo"],
                    "valor": p["farm"]["cs"],
                }
                for p in players
            ],

            "vision_por_jugador": [
                {
                    "jugador": p["riot_id"],
                    "equipo": p["equipo"],
                    "valor": p["vision"]["score"],
                }
                for p in players
            ],

            "mitigacion_por_jugador": [
                {
                    "jugador": p["riot_id"],
                    "equipo": p["equipo"],
                    "valor": p["soporte"]["daño_mitigado"],
                }
                for p in players
            ],

            "curacion_por_jugador": [
                {
                    "jugador": p["riot_id"],
                    "equipo": p["equipo"],
                    "valor": p["soporte"]["daño_curado"],
                }
                for p in players
            ],

            "control_por_jugador": [
                {
                    "jugador": p["riot_id"],
                    "equipo": p["equipo"],
                    "valor": p["soporte"]["control_adversarios"],
                }
                for p in players
            ],

            "kills_por_equipo": [
                {
                    "equipo": t,
                    "valor": v["resumen"]["kills"],
                }
                for t, v in teams.items()
            ],

            "oro_por_equipo": [
                {
                    "equipo": t,
                    "valor": v["resumen"]["oro_total"],
                }
                for t, v in teams.items()
            ],
        },

        "disponibilidad": {
            "timeline": False,
            "first_blood": False,
            "participacion_objetivos": False,
            "compras_con_tiempo": False,
            "eventos": False,
        },

        "nota": (
            "Los campos timeline/eventos/first_blood "
            "no se inventan: statsJson no los contiene. "
            "Los IDs de campeones, objetos, runas y "
            "hechizos deben resolverse contra datos de "
            "LoL (p.ej. Data Dragon)."
        ),
    }

    base, _ = os.path.splitext(path)
    outpath = base + OUTPUT_SUFFIX

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


if __name__ == "__main__":
    if (
        len(sys.argv) != 2
        or not os.path.isfile(sys.argv[1])
    ):
        sys.exit(1)

    try:
        main(sys.argv[1])
    except Exception:
        sys.exit(1)

