import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from handlers.classification_handler import classify_process


def test_tier_1_classification_lowercase():
    """Test that a critical OS component is classified as Tier 1."""
    tier = classify_process("explorer.exe", cpu_percent=1.0, memory_mb=50.0, is_headless=True)
    assert tier == 1, "explorer.exe must be classified as Tier 1"

def test_tier_1_classification_uppercase():
    """Test that classification is case-insensitive for Tier 1."""
    tier = classify_process("EXPLORER.EXE", cpu_percent=1.0, memory_mb=50.0, is_headless=True)
    assert tier == 1, "EXPLORER.EXE must be classified as Tier 1 (case-insensitive)"

def test_tier_4_high_cpu_anomaly():
    """Test that a headless background process hogging CPU is flagged as Tier 4."""
    # A random unknown process taking 60% CPU in the background
    tier = classify_process("unknown_miner.exe", cpu_percent=60.0, memory_mb=100.0, is_headless=True)
    assert tier == 4, "High CPU headless process must be classified as Tier 4"

def test_tier_2_essential_app():
    """Test that an essential user application is classified as Tier 2."""
    tier = classify_process("Code.exe", cpu_percent=2.0, memory_mb=300.0, is_headless=False)
    assert tier == 2, "Code.exe must be classified as Tier 2"

def test_tier_3_standard_background():
    """Test that a normal, low-impact background process falls into Tier 3."""
    tier = classify_process("braveupdate.exe", cpu_percent=0.5, memory_mb=10.0, is_headless=True)
    assert tier == 3, "Standard low-impact process must be classified as Tier 3"
