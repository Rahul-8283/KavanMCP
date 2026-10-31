import asyncio
import os
import sys
import tempfile
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set before config.settings_manager is imported, which loads the settings at import time
os.environ["KAVAN_SETTINGS_PATH"] = os.path.join(tempfile.mkdtemp(prefix="kavan-settings-"), "settings.json")

from database import db


@pytest.fixture(autouse=True, scope="session")
def isolated_audit_db(tmp_path_factory):
    """
    Points every test at a throwaway audit database. Without this, tests that kill
    dummy processes or probe Tier 1 would write fake rows into the real audit ledger.
    """
    original = db.DB_PATH
    db.DB_PATH = str(tmp_path_factory.mktemp("audit") / "process.db")
    asyncio.run(db.init_db())
    yield
    db.DB_PATH = original


@pytest.fixture
def fake_popen():
    """Replaces the launch in a restore, so a test never starts a real application."""
    from handlers import termination_handler

    with patch.object(termination_handler.subprocess, "Popen") as popen:
        popen.return_value.pid = 4242
        yield popen


def pytest_collection_modifyitems(items):
    """
    KAVAN_TEST_SHUFFLE=<seed> runs the tests in a random order that the seed reproduces.
    A suite that only passes in file order has tests leaning on each other's leftovers.
    """
    seed = os.environ.get("KAVAN_TEST_SHUFFLE")
    if seed:
        import random

        random.Random(seed).shuffle(items)
