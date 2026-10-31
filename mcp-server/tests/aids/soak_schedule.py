"""A fixed 24-hour script of spikes for the soak test, logging each one.

    python soak_schedule.py [--hours 24] [--log soak.log] [--scale 1]

Over 24 hours it produces: a 2-minute CPU burn every 3 hours, a 2-minute memory hold every
6 hours, one 10-second CPU spike, and one 5-minute windowless burn. --scale shrinks every
interval, so the whole script can be rehearsed in minutes (--scale 0.01 runs it in about 15).
Every event is logged with its scheduled start, and each burn logs its own real start and stop,
to be compared with Kavan's alerts afterwards.
"""
import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

AIDS = os.path.dirname(os.path.abspath(__file__))
HOUR = 3600


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def build_plan(hours: float) -> list[tuple[float, str, list[str]]]:
    """(seconds from the start, label, argv) for every event, in order."""
    burn = os.path.join(AIDS, "cpu_burn.py")
    hold = os.path.join(AIDS, "mem_hold.py")
    plan: list[tuple[float, str, list[str]]] = []
    for index, at in enumerate(range(1, int(hours), 3)):
        plan.append((at * HOUR, f"cpu-burn-{index}", [burn, "--seconds", "120"]))
    for index, at in enumerate(range(2, int(hours), 6)):
        plan.append((at * HOUR + 1800, f"mem-hold-{index}", [hold, "--mb", "3000", "--seconds", "120"]))
    plan.append((hours * HOUR * 0.4, "cpu-spike-10s", [burn, "--seconds", "10"]))
    plan.append((hours * HOUR * 0.7, "windowless-burn", [burn, "--seconds", "300", "--windowless"]))
    return sorted(plan)


def scaled_args(argv: list[str], scale: float) -> list[str]:
    """The numeric arguments (seconds, megabytes only for --seconds) shrunk by the scale."""
    out = list(argv)
    for index, arg in enumerate(out[:-1]):
        if arg == "--seconds":
            out[index + 1] = str(max(1, int(float(out[index + 1]) * scale)))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--hours", type=float, default=24)
    parser.add_argument("--log", default="soak.log")
    parser.add_argument("--scale", type=float, default=1.0)
    args = parser.parse_args()

    started = time.time()
    with open(args.log, "a", encoding="utf-8") as log:
        log.write(f"soak start {_stamp()} hours={args.hours} scale={args.scale}\n")
    for offset, label, argv in build_plan(args.hours):
        wait = started + offset * args.scale - time.time()
        if wait > 0:
            time.sleep(wait)
        with open(args.log, "a", encoding="utf-8") as log:
            log.write(f"{label} scheduled-start {_stamp()}\n")
        subprocess.Popen([sys.executable, *scaled_args(argv, args.scale), "--log", args.log])
    with open(args.log, "a", encoding="utf-8") as log:
        log.write(f"soak end {_stamp()}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
