import asyncio
import time
import psutil
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools.analyze_system import analyze_system_logic

async def run_stress_test(duration_seconds: int = 60, interval_seconds: int = 2):
    """
    Hits the analyze_system tool repeatedly to monitor for memory leaks.
    By default, runs a quick 60-second test. Change duration_seconds to 3600 for the full 1-hour burn-in.
    """
    process = psutil.Process(os.getpid())
    print("==================================================")
    print(f"Starting KavanMCP Stress Test ({duration_seconds} seconds)")
    print(f"Target: analyze_system tool every {interval_seconds} seconds")
    print(f"Initial Memory: {process.memory_info().rss / (1024 * 1024):.2f} MB")
    print("==================================================\n")
    
    start_time = time.time()
    iterations = 0
    
    while (time.time() - start_time) < duration_seconds:
        # Fire the tool logic (simulating an LLM calling it)
        analyze_system_logic()
        
        iterations += 1
        
        # Log every 5 iterations to avoid spamming the console too much
        if iterations % 5 == 0:
            current_mem = process.memory_info().rss / (1024 * 1024)
            elapsed = int(time.time() - start_time)
            print(f"[{elapsed}s elapsed] Iteration {iterations} | Current Memory: {current_mem:.2f} MB")
            
        await asyncio.sleep(interval_seconds)
        
    final_mem = process.memory_info().rss / (1024 * 1024)
    print("\n==================================================")
    print(f"Stress Test Complete!")
    print(f"Total Iterations: {iterations}")
    print(f"Final Memory: {final_mem:.2f} MB")
    if final_mem < 60:
        print("✅ PASS: Memory remained stable and under 60MB.")
    else:
        print("❌ FAIL: Memory exceeded 60MB threshold. Possible leak detected.")
    print("==================================================")

if __name__ == "__main__":
    try:
        asyncio.run(run_stress_test())
    except KeyboardInterrupt:
        print("\nTest manually aborted by user.")
