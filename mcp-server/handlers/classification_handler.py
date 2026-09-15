from config.whitelist import TIER_1_WHITELIST

# A hardcoded set of essential user apps for Tier 2. 
# In a future phase, this could be moved to a JSON config.
TIER_2_ESSENTIAL = {
    "code.exe",
    "devenv.exe",
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "spotify.exe",
    "discord.exe",
    "slack.exe",
    "obs64.exe"
}

def classify_process(process_name: str, cpu_percent: float, memory_mb: float, is_headless: bool) -> int:
    """
    The core decision matrix for the KavanMCP security engine.
    Categorizes a process into Tier 1-4 based on its identity and behavior.
    """
    if not process_name:
        return 3 # Default to Tier 3 if name is missing
        
    proc_lower = process_name.lower()

    # 1. Tier 1 (Critical OS Component): Cannot be touched.
    if proc_lower in TIER_1_WHITELIST:
        return 1

    # 2. Tier 2 (Essential Work Apps): Requires single confirmation.
    if proc_lower in TIER_2_ESSENTIAL:
        return 2

    # 3. Tier 4 (Suspicious Anomaly): High-risk background task hogging CPU
    # 25.0% CPU is massive for a headless background process on a multi-core CPU.
    if cpu_percent > 25.0 and is_headless:
        return 4

    # 4. Tier 3 (Standard Background Task): Optional / Updaters. Dual confirmation.
    return 3
