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

from roflParser import MAX_METADATA_SIZE, main, parse_rofl

FIXTURE_PATH = os.path.join(PARSER_DIR, "data", "EUW1-7982902321.rofl")
EXPECTED_RESULT_PATH = os.path.join(PARSER_DIR, "result", "EUW1-7982902321_estadisticas.json")


class TestRoflParser(unittest.TestCase):
    def test_sample_rofl_exists(self):
        """Verifica que el archivo de repetición de prueba exista en apps/parser/data."""
        self.assertTrue(
            os.path.isfile(FIXTURE_PATH),
            f"El archivo fixture no existe en: {FIXTURE_PATH}",
        )

    def test_parse_real_rofl(self):
        """Parsea apps/parser/data/EUW1-7982902321.rofl a un archivo temporal y comprueba estructura y métricas."""
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
            if os.path.isfile(EXPECTED_RESULT_PATH):
                with open(EXPECTED_RESULT_PATH, "r", encoding="utf-8") as f:
                    expected_data = json.load(f)
                self.assertEqual(data, expected_data)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

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
        """Verifica que main() retorne código 1 cuando el archivo no existe."""
        with io.StringIO() as captured_stderr:
            with unittest.mock.patch("sys.stderr", captured_stderr):
                exit_code = main(["non_existent_file_path.rofl"])
                self.assertEqual(exit_code, 1)
                self.assertIn("Error: El archivo no existe o no es válido", captured_stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
