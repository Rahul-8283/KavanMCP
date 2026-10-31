"""Phase 8 §2.2: KAVAN_DATA_DIR moves the database and the settings file together."""
import os
import subprocess
import sys

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROBE = ("import sys; sys.path.insert(0, '.'); from database import db; from config import settings_manager as s; "
         "print(db.DB_PATH); print(s.CONFIG_PATH)")


def _paths(**env):
    base = {k: v for k, v in os.environ.items() if k not in ("KAVAN_DATA_DIR", "KAVAN_SETTINGS_PATH")}
    base.update(env)
    out = subprocess.run([sys.executable, "-c", PROBE], capture_output=True, text=True, check=True,
                         env=base, cwd=SERVER_DIR).stdout.strip().splitlines()
    return out[-2], out[-1]


def test_the_data_dir_override_moves_the_database_and_the_settings(tmp_path):
    database, settings = _paths(KAVAN_DATA_DIR=str(tmp_path))

    assert database == str(tmp_path / "process.db")
    assert settings == str(tmp_path / "settings.json")


def test_unset_the_paths_are_the_real_data_folder():
    database, settings = _paths()

    assert database == os.path.join(SERVER_DIR, "data", "process.db")
    assert settings == os.path.join(SERVER_DIR, "data", "settings.json")


def test_the_settings_override_still_wins_over_the_data_dir(tmp_path):
    _, settings = _paths(KAVAN_DATA_DIR=str(tmp_path), KAVAN_SETTINGS_PATH=str(tmp_path / "elsewhere.json"))

    assert settings == str(tmp_path / "elsewhere.json")
