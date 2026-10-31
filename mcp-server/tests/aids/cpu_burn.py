"""Pushes CPU over a threshold for a known time and logs when it started and stopped.

    python cpu_burn.py --seconds 120 --cores 4 [--windowless] [--log burn.log]

--windowless starts the burn again with no console window. Kavan classifies such a process Tier 4
when it keeps the CPU high, so it raises a suspicious-process alert.
"""
import argparse
import multiprocessing
import os
import subprocess
import sys
import time
from datetime import datetime, timezone


def _spin(deadline: float) -> None:
    while time.time() < deadline:
        pass


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seconds", type=float, default=120)
    parser.add_argument("--cores", type=int, default=max(1, (os.cpu_count() or 2) // 2))
    parser.add_argument("--windowless", action="store_true")
    parser.add_argument("--log", default="cpu_burn.log")
    args = parser.parse_args()

    if args.windowless and "KAVAN_BURN_CHILD" not in os.environ:
        env = {**os.environ, "KAVAN_BURN_CHILD": "1"}
        argv = [sys.executable, os.path.abspath(__file__), "--seconds", str(args.seconds), "--cores", str(args.cores),
                "--log", os.path.abspath(args.log)]
        subprocess.Popen(argv, env=env, creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
        print("started without a window")
        return 0

    started = time.time()
    with open(args.log, "a", encoding="utf-8") as log:
        log.write(f"cpu_burn start {_stamp()} pid={os.getpid()} cores={args.cores} seconds={args.seconds}\n")
    deadline = started + args.seconds
    workers = [multiprocessing.Process(target=_spin, args=(deadline,)) for _ in range(args.cores)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join()
    with open(args.log, "a", encoding="utf-8") as log:
        log.write(f"cpu_burn stop {_stamp()} pid={os.getpid()}\n")
    return 0


if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(main())
