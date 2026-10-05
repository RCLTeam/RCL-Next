#!/usr/bin/env python3
import io
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

PARSER_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
REPO_ROOT = os.path.abspath(os.path.join(PARSER_DIR, "..", ".."))
sys.path.insert(0, PARSER_DIR)
sys.path.insert(0, REPO_ROOT)

from roflParser import (
    EXIT_CORRUPT_METADATA,
    EXIT_FILE_NOT_FOUND,
    EXIT_GENERIC_ERROR,
    EXIT_INVALID_MAGIC_HEADER,
    EXIT_INVALID_PAYLOAD_LENGTH,
    EXIT_OUTPUT_WRITE_ERROR,
    EXIT_SUCCESS,
    MAX_METADATA_SIZE,
    CorruptMetadataError,
    InvalidMagicHeaderError,
    InvalidPayloadLengthError,
    OutputWriteError,
    RoflFileNotFoundError,
    main,
    parse_rofl,
    read_rofl,
)

FIXTURE_PATH = os.path.join(PARSER_DIR, "data", "RCL-FIXTURE-0001.rofl")
EXPECTED_RESULT_PATH = os.path.join(PARSER_DIR, "result", "RCL-FIXTURE-0001_estadisticas.json")

# El fixture es sintético: identificador de partida e identidades de jugador ficticios.
SYNTHETIC_GAME_ID = "RCL-FIXTURE-0001"
SYNTHETIC_TAG = "ANON"
SYNTHETIC_NAME_PATTERN = r"^Anon (Azul|Rojo) [1-5]$"
SYNTHETIC_PUUID_PATTERN = r"^00000000-0000-4000-8000-0000000000(0[1-9]|10)$"


class TestRoflParser(unittest.TestCase):
    def test_sample_rofl_exists(self):
        """Verifica que el archivo de repetición de prueba exista en apps/parser/data."""
        self.assertTrue(
            os.path.isfile(FIXTURE_PATH),
            f"El archivo fixture no existe en: {FIXTURE_PATH}",
        )

    def test_parse_fixture_rofl(self):
        """Parsea el fixture sintético apps/parser/data/RCL-FIXTURE-0001.rofl y comprueba estructura y métricas."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            data = parse_rofl(FIXTURE_PATH, output_path=tmp_path, quiet=True)

            self.assertEqual(data["version"], 2)
            self.assertEqual(len(data["jugadores"]), 10)
            self.assertEqual(data["partida"]["equipo_ganador"], 100)
            self.assertIn("100", data["equipos"])
            self.assertIn("200", data["equipos"])
            self.assertTrue(data["equipos"]["100"]["victoria"])
            self.assertFalse(data["equipos"]["200"]["victoria"])

            for p in data["jugadores"]:
                self.assertIn("nombre", p)
                self.assertIn("tag", p)
                self.assertIn("riot_id", p)
                self.assertIn("kda", p)
                self.assertIn("kills", p["kda"])
                self.assertIn("muertes", p["kda"])
                self.assertIn("asistencias", p["kda"])
                self.assertIn("oro", p)
                self.assertIn("cs", p)
                self.assertIn(p["resultado"], ("Win", "Lose"))
                self.assertIn("runas", p)
                self.assertIn("primaria", p["runas"])
                self.assertIn("secundaria", p["runas"])
                self.assertIn("fragmentos", p["runas"])
                self.assertIn("objetos", p)
                self.assertEqual(len(p["objetos"]["slots"]), 7)
                for slot_info in p["objetos"]["slots"]:
                    self.assertIn("slot", slot_info)
                    self.assertIn("id", slot_info)

            # Comprobar además que el archivo generado coincide con el fixture de referencia esperado
            self.assertTrue(
                os.path.isfile(EXPECTED_RESULT_PATH),
                f"El resultado de referencia no existe en: {EXPECTED_RESULT_PATH}",
            )
            with open(EXPECTED_RESULT_PATH, "r", encoding="utf-8") as f:
                expected_data = json.load(f)
            self.assertEqual(data, expected_data)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_fixture_uses_only_synthetic_identities(self):
        """Comprueba que el fixture solo contiene identidades ficticias (sin Riot ID ni PUUID reales)."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            data = parse_rofl(FIXTURE_PATH, output_path=tmp_path, quiet=True)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        self.assertEqual(data["fuente"]["archivo"], f"{SYNTHETIC_GAME_ID}.rofl")
        self.assertEqual(len(data["jugadores"]), 10)
        for p in data["jugadores"]:
            self.assertRegex(p["nombre"], SYNTHETIC_NAME_PATTERN)
            self.assertEqual(p["tag"], SYNTHETIC_TAG)
            self.assertEqual(p["riot_id"], f"{p['nombre']}#{SYNTHETIC_TAG}")
            self.assertRegex(p["puuid"], SYNTHETIC_PUUID_PATTERN)

        # Los identificadores internos de invocador que el parser no exporta también son ficticios.
        raw_players = json.loads(read_rofl(FIXTURE_PATH)["statsJson"])
        synthetic_ids = {str(n) for n in range(1, 11)}
        for raw in raw_players:
            self.assertIn(raw["SUMMONER_ID"], synthetic_ids)
            self.assertIn(raw["ID"], synthetic_ids)

    def test_invalid_header_rejection(self):
        """Comprueba que un archivo sin cabecera b'RIOT' levante ValueError."""
        with tempfile.NamedTemporaryFile(suffix=".rofl", delete=False) as tmp:
            tmp.write(b"NOT_RIOT_HEADER_SAMPLE_PAYLOAD_1234567890")
            tmp_path = tmp.name

        try:
            with self.assertRaises(ValueError) as ctx:
                parse_rofl(tmp_path, quiet=True)
            self.assertIn("Cabecera ROFL no reconocida", str(ctx.exception))
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_file_too_small_rejection(self):
        """Comprueba que un archivo menor a 8 bytes levante ValueError de tamaño insuficiente."""
        with tempfile.NamedTemporaryFile(suffix=".rofl", delete=False) as tmp:
            tmp.write(b"RIOT")
            tmp_path = tmp.name

        try:
            with self.assertRaises(ValueError) as ctx:
                parse_rofl(tmp_path, quiet=True)
            self.assertIn("Archivo ROFL demasiado pequeño", str(ctx.exception))
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_invalid_metadata_length_rejection(self):
        """Comprueba que un trailer con longitud de metadata <= 0 o > MAX_METADATA_SIZE sea rechazado."""
        with tempfile.NamedTemporaryFile(suffix=".rofl", delete=False) as tmp:
            tmp.write(b"RIOT" + b"\x00" * 10 + (0).to_bytes(4, byteorder="little"))
            tmp_path = tmp.name

        try:
            with self.assertRaises(ValueError) as ctx:
                parse_rofl(tmp_path, quiet=True)
            self.assertIn("Longitud de metadata inválida", str(ctx.exception))
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_cli_main_success_and_quiet(self):
        """Verifica la ejecución de la CLI mediante main() con flags -o y -q."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            exit_code = main([FIXTURE_PATH, "-o", tmp_path, "-q"])
            self.assertEqual(exit_code, 0)
            self.assertTrue(os.path.exists(tmp_path))
            self.assertGreater(os.path.getsize(tmp_path), 0)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_cli_main_file_not_found(self):
        """Verifica que main() retorne código 10 cuando el archivo no existe."""
        with io.StringIO() as captured_stderr:
            with unittest.mock.patch("sys.stderr", captured_stderr):
                exit_code = main(["non_existent_file_path.rofl"])
                self.assertEqual(exit_code, EXIT_FILE_NOT_FOUND)
                self.assertIn("Error: El archivo no existe o no es válido", captured_stderr.getvalue())

    def test_cli_main_invalid_magic_header(self):
        """Verifica que main() retorne código 11 cuando la cabecera no es b'RIOT'."""
        with tempfile.NamedTemporaryFile(suffix=".rofl", delete=False) as tmp:
            tmp.write(b"NOT_A_VALID_ROFL_FILE_CONTENT_AT_ALL")
            tmp_path = tmp.name

        try:
            with io.StringIO() as captured_stderr:
                with unittest.mock.patch("sys.stderr", captured_stderr):
                    exit_code = main([tmp_path, "-q"])
                    self.assertEqual(exit_code, EXIT_INVALID_MAGIC_HEADER)
                    self.assertIn("Cabecera ROFL no reconocida", captured_stderr.getvalue())
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_cli_main_invalid_payload_length(self):
        """Verifica que main() retorne código 12 cuando la longitud del payload es inválida."""
        with tempfile.NamedTemporaryFile(suffix=".rofl", delete=False) as tmp:
            tmp.write(b"RIOT" + b"\x00" * 10 + (0).to_bytes(4, byteorder="little"))
            tmp_path = tmp.name

        try:
            with io.StringIO() as captured_stderr:
                with unittest.mock.patch("sys.stderr", captured_stderr):
                    exit_code = main([tmp_path, "-q"])
                    self.assertEqual(exit_code, EXIT_INVALID_PAYLOAD_LENGTH)
                    self.assertIn("Longitud de metadata inválida", captured_stderr.getvalue())
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_cli_main_corrupt_metadata(self):
        """Verifica que main() retorne código 13 cuando la metadata JSON está corrupta."""
        corrupt_payload = b"{not_valid_json"
        payload_len = len(corrupt_payload)
        with tempfile.NamedTemporaryFile(suffix=".rofl", delete=False) as tmp:
            tmp.write(b"RIOT" + b"\x00" * 4 + corrupt_payload + payload_len.to_bytes(4, byteorder="little"))
            tmp_path = tmp.name

        try:
            with io.StringIO() as captured_stderr:
                with unittest.mock.patch("sys.stderr", captured_stderr):
                    exit_code = main([tmp_path, "-q"])
                    self.assertEqual(exit_code, EXIT_CORRUPT_METADATA)
                    self.assertIn("Metadata corrupta", captured_stderr.getvalue())
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_cli_main_output_write_error(self):
        """Verifica que main() retorne código 14 cuando no se puede escribir el archivo de salida."""
        with tempfile.NamedTemporaryFile(suffix=".json") as tmp:
            invalid_out = os.path.join(tmp.name, "subdir_does_not_exist", "output.json")

        with io.StringIO() as captured_stderr:
            with unittest.mock.patch("sys.stderr", captured_stderr):
                with unittest.mock.patch("builtins.open", side_effect=[open(FIXTURE_PATH, "rb"), OSError("Disk full")]):
                    exit_code = main([FIXTURE_PATH, "-o", invalid_out, "-q"])
                    self.assertEqual(exit_code, EXIT_OUTPUT_WRITE_ERROR)


if __name__ == "__main__":
    unittest.main()
