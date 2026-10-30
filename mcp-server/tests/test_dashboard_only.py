"""Phase 6 §5.2: `main.py --dashboard-only` serves the dashboard with no MCP transport."""
import os
import socket
import subprocess
import sys
import time
import urllib.request

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = os.path.join(SERVER_DIR, "main.py")


def _env(tmp_path):
    env = dict(os.environ)
    env["KAVAN_SETTINGS_PATH"] = str(tmp_path / "settings.json")
    return env


def test_dashboard_only_exits_cleanly_when_the_port_is_taken(tmp_path):
    # Holds 8000 for the duration, unless something else already does, which is the same outcome
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as holder:
        try:
            holder.bind(("127.0.0.1", 8000))
            holder.listen(1)
        except OSError:
            pass

        result = subprocess.run([sys.executable, MAIN, "--dashboard-only"], stdin=subprocess.DEVNULL,
                                capture_output=True, timeout=120, check=False, env=_env(tmp_path), cwd=SERVER_DIR,
                                creationflags=subprocess.CREATE_NO_WINDOW)

    assert result.returncode == 0


def test_dashboard_only_serves_the_dashboard_with_stdin_closed(tmp_path):
    port = 8011
    script = (
        "import sys\n"
        "sys.argv = ['main.py', '--dashboard-only']\n"
        "import ws_server\n"
        f"ws_server.PORT = {port}\n"
        f"ws_server.ALLOWED_HOSTS = {{'127.0.0.1:{port}'}}\n"
        "import main\n"
        "main.main()\n"
    )
    process = subprocess.Popen([sys.executable, "-c", script], cwd=SERVER_DIR, stdin=subprocess.DEVNULL,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=_env(tmp_path),
                               creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        answered = None
        deadline = time.time() + 60
        while time.time() < deadline and answered is None:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/get_config", timeout=2) as response:
                    answered = response.status
            except OSError:
                time.sleep(0.5)

        assert answered == 200
        time.sleep(1)
        assert process.poll() is None, "the dashboard must stay up with no MCP transport attached"
    finally:
        process.kill()
        process.wait(timeout=10)

