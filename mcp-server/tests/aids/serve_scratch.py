"""Runs the real dashboard backend on another port, over a scratch data folder.

    set KAVAN_DATA_DIR=C:\\Temp\\kavan-test
    python serve_scratch.py --port 8001 [--origin http://localhost:1421]

It is the same app as `python main.py --dashboard-only`, with the port and the allowed hosts moved,
so it can run beside a backend that already holds port 8000. The metrics loop, the process watch and
the history recorder all run, so alerts from a real burn are recorded for real.

Refuses to run without KAVAN_DATA_DIR, so it can never write to the real database.
"""
import argparse
import asyncio
import os
import sys

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, SERVER_DIR)


def main() -> int:
    if not os.environ.get("KAVAN_DATA_DIR"):
        print("Refusing to run: set KAVAN_DATA_DIR to a scratch folder first.", file=sys.stderr)
        return 2

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--origin", action="append", default=[], help="an extra allowed web origin, such as a Vite dev server")
    args = parser.parse_args()

    import uvicorn

    import ws_server as w
    from database import db

    asyncio.run(db.init_db())
    w.PORT = args.port
    w.ALLOWED_HOSTS = {f"127.0.0.1:{args.port}", f"localhost:{args.port}"}
    w.ALLOWED_ORIGINS.extend(args.origin)
    print(f"serving on {args.port}, data in {db.DATA_DIR}", flush=True)
    uvicorn.run(w.app, host="127.0.0.1", port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
