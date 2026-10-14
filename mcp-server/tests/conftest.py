import asyncio
import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
