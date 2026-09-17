import sys
import os
import json
import pytest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from handlers.approval_handler import request_approval, is_approved, PENDING_APPROVALS
from tools.execute_termination import execute_termination_logic

@pytest.fixture(autouse=True)
def clean_pending_approvals():
    """Ensure the state is clean before each test."""
    PENDING_APPROVALS.clear()
    yield

def test_request_approval_flow():
    """Test that a process gets successfully added to the pending dictionary."""
    result = request_approval(9999, "notepad.exe", 3)
    
    # Assert string returns correctly
    assert "notepad.exe" in result
    assert "9999" in result
    
    # Assert state is valid
    assert is_approved(9999) is True

@patch('handlers.approval_handler.time')
def test_approval_ttl_expiration(mock_time):
    """Test that the 5-minute Time-To-Live (TTL) successfully expires old approvals."""
    # Mock current time as 0
    mock_time.time.return_value = 0
    request_approval(8888, "stale_app.exe", 2)
    
    # Assert it works initially
    assert is_approved(8888) is True
    
    # Fast forward time by 6 minutes (360 seconds)
    mock_time.time.return_value = 360
    
    # Assert it is now expired and False
    assert is_approved(8888) is False
    
    # Assert it was automatically deleted from memory
    assert 8888 not in PENDING_APPROVALS

@pytest.mark.asyncio
async def test_execute_termination_blocks_unapproved_pid():
    """Test that the Execution Tool instantly rejects any PID not in the approved cache."""
    # Try to execute a PID that was never approved
    response_json = await execute_termination_logic([7777])
    
    # Parse the returned JSON
    results = json.loads(response_json)
    
    # Assert that the system blocked it
    assert len(results) == 1
    assert results[0]["pid"] == 7777
    assert results[0]["status"] == "blocked"
    assert "Execution blocked" in results[0]["error"]
