"""Holds memory for a known time, to push RAM over its threshold, and logs start and stop.

    python mem_hold.py --mb 4000 --seconds 120 [--log mem.log]
"""
import argparse
import os
import time
from datetime import datetime, timezone


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mb", type=int, default=1000)
    parser.add_argument("--seconds", type=float, default=120)
    parser.add_argument("--log", default="mem_hold.log")
    args = parser.parse_args()

    with open(args.log, "a", encoding="utf-8") as log:
        log.write(f"mem_hold start {_stamp()} pid={os.getpid()} mb={args.mb}\n")
    # Every page is written to, or the operating system would not really commit the memory
    block = bytearray(args.mb * 1024 * 1024)
    for offset in range(0, len(block), 4096):
        block[offset] = 1
    time.sleep(args.seconds)
    with open(args.log, "a", encoding="utf-8") as log:
        log.write(f"mem_hold stop {_stamp()} pid={os.getpid()}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
