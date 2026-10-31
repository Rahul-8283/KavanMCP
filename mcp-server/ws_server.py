import asyncio
import socket
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

import psutil
import uvicorn
from fastapi import (
    BackgroundTasks,
    FastAPI,
    HTTPException,
    Response,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config.settings_manager import (
    ACTIVE_CONFIG,
    MAX_LIST_ENTRIES,
    load_config,
    update_config,
)
from database.db import (
    close_alert_event,
    close_orphaned_alert_events,
    get_alert_event,
    mark_alert_muted,
    open_alert_event,
    prune_history,
    record_metrics_minute,
    set_alert_top_process,
    update_alert_event,
)
from handlers.approval_handler import stage_termination
from handlers.history_recorder import (
    ALERT_METRICS,
    CRITICAL_LEVEL,
    SAMPLE_INTERVAL_SECONDS,
    Episode,
    EpisodeChange,
    EpisodeTracker,
    MinuteAggregator,
)
from handlers.process_watch import (
    PROCESS_WATCH_INTERVAL,
    ProcessWatcher,
    lookup_top_process,
    scan_processes,
)
from handlers.protection import is_alert_muted
from handlers.termination_handler import execute_approved_termination
from routes import history, kills
from routes.history import serialize_alert
from tools.list_processes import list_processes_logic
from utils.logger import logger
from utils.timefmt import utc_text


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The first cpu_percent(interval=None) call only sets the baseline and returns 0.0
    psutil.cpu_percent(interval=None)
    # Only the instance that owns the port reaches this, so it is the only one recording
    orphaned = await close_orphaned_alert_events()
    if orphaned:
        logger.info(f"Closed {orphaned} alert episode(s) left open by a previous run.")

    tasks = [asyncio.create_task(metrics_broadcaster()), asyncio.create_task(process_watch()),
             asyncio.create_task(history_pruner())]
    yield
    for task in tasks:
        task.cancel()
    await flush_history()

app = FastAPI(title="KavanMCP WebSocket Server", lifespan=lifespan)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    # exc.errors() can carry the raw request body as bytes, which is not JSON serialisable
    detail = [{"type": e.get("type"), "loc": list(e.get("loc", ())), "msg": e.get("msg")} for e in exc.errors()]
    return JSONResponse(status_code=400, content={"detail": detail})

HOST = "127.0.0.1"
PORT = 8000

# Only the Tauri window may call this API. Any other origin (e.g. a web page open in
# the browser) would otherwise be able to reach the kill endpoints on localhost.
# Dev: Vite runs on 1420. Release (Windows): Tauri serves from tauri.localhost.
ALLOWED_ORIGINS = [
    "http://localhost:1420",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
]
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}

class LocalOnlyMiddleware:
    """
    Rejects requests from foreign web origins before they reach a route.

    CORS alone is not enough: it only stops a browser from reading the response, the
    request itself still runs, and it does not apply to WebSockets at all. The Host check
    defeats DNS rebinding, where a hostile page becomes same-origin with this server and
    so needs no CORS permission. Non-browser local clients send no Origin and are allowed.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
            origin = headers.get("origin")
            host = headers.get("host", "").lower()

            if host not in ALLOWED_HOSTS or (origin is not None and origin not in ALLOWED_ORIGINS):
                logger.warning(f"Rejected request from origin={origin!r} host={host!r} to {scope.get('path')}")
                if scope["type"] == "websocket":
                    await send({"type": "websocket.close", "code": 1008})
                else:
                    response = JSONResponse(
                        status_code=403,
                        content={"detail": {"code": "forbidden_origin", "message": "This API only accepts requests from the KavanMCP app."}},
                    )
                    await response(scope, receive, send)
                return

        await self.app(scope, receive, send)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
# Added last so it is the outermost layer and runs before CORS and routing
app.add_middleware(LocalOnlyMiddleware)

# Middleware belongs to the app, so routes on a router are guarded exactly like the ones below
app.include_router(history.router)
app.include_router(kills.router)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        # Gracefully handle disconnected clients during broadcast
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:  # noqa: BLE001 - a failed send or background pass is logged, and the connection or loop carries on
                dead_connections.append(connection)
        
        for dead in dead_connections:
            self.disconnect(dead)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We just need to keep connection open and detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:  # noqa: BLE001 - a failed send or background pass is logged, and the connection or loop carries on
        manager.disconnect(websocket)

@app.get("/api/list_processes")
async def get_processes():
    """Phase 3 REST Endpoint: Returns all running processes and their assigned security tiers."""
    # Scanning every process blocks for seconds. Run it in a worker thread, or it
    # stalls the whole server: metric broadcasts and /api/get_config queue behind it.
    json_str = await asyncio.to_thread(list_processes_logic)
    return Response(content=json_str, media_type="application/json")

@app.get("/api/get_config")
async def get_config():
    """Phase 5 REST Endpoint: Returns the current alert thresholds and UI preferences."""
    config_data = load_config()
    return config_data

class ConfigUpdate(BaseModel):
    cpu_threshold: int | None = Field(None, ge=0, le=100)
    ram_threshold: int | None = Field(None, ge=0, le=100)
    disk_threshold: int | None = Field(None, ge=0, le=100)
    theme: Literal["dark", "light"] | None = None
    sound_alerts: bool | None = None
    never_kill: list[str] | None = Field(None, max_length=MAX_LIST_ENTRIES * 2)
    never_alert: list[str] | None = Field(None, max_length=MAX_LIST_ENTRIES * 2)
    sound_volume: int | None = Field(None, ge=0, le=100, strict=True)
    sound_choice: Literal["chime", "pulse", "bell", "soft"] | None = None
    alert_retention_days: Literal[7, 14, 30] | None = None

@app.post("/api/update_thresholds")
async def update_thresholds(payload: ConfigUpdate, background: BackgroundTasks):
    """Phase 5 REST Endpoint: Partially updates the active config and persists it."""
    # Only merge fields that were sent with a value; an explicit null means "no change"
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        return {"status": "ignored", "message": "No valid data provided."}

    new_config = update_config(update_data)
    if "alert_retention_days" in update_data:
        # A shorter window is expected to take effect now, not at the next hourly prune.
        # Background tasks run after the response is sent, so the request does not wait.
        background.add_task(prune_history, METRICS_RETENTION_DAYS, new_config["alert_retention_days"])
    return {"status": "success", "config": new_config}

class PidRequest(BaseModel):
    pid: int = Field(..., ge=0)

# Maps termination statuses to HTTP codes. The UI reads `detail.code` for its messages.
KILL_HTTP_STATUS = {
    "tier1_blocked": 403,
    "self_protected": 403,
    "user_protected": 403,
    "access_denied": 403,
    "not_approved": 409,
    "pid_reused": 409,
    "not_found": 404,
    "error": 500,
}

def _kill_error(result: dict) -> HTTPException:
    status = result["status"]
    return HTTPException(
        status_code=KILL_HTTP_STATUS.get(status, 500),
        detail={"code": status, "message": result.get("error", "Termination failed.")},
    )

@app.post("/api/confirm_termination")
async def confirm_termination(payload: PidRequest):
    """Phase 8 Step 1: stage a PID in the approval cache. Tier 1 is rejected and logged."""
    result = await stage_termination(payload.pid, source="UI")
    if result["status"] != "pending":
        raise _kill_error(result)
    return result

@app.post("/api/execute_termination")
async def execute_termination(payload: PidRequest):
    """Phase 8 Step 2: kill a PID that was staged by /api/confirm_termination within its TTL."""
    result = await execute_approved_termination(
        payload.pid, reasoning="User confirmed termination via KavanMCP UI"
    )
    if result["status"] != "success":
        raise _kill_error(result)
    return {"pid": payload.pid, **result}

ALERT_COOLDOWN = 3.0  # seconds between repeated alerts for the same metric
BROADCAST_INTERVAL = SAMPLE_INTERVAL_SECONDS
# About 10,000 rows, which SQLite reads in milliseconds and is long enough to see a daily pattern
METRICS_RETENTION_DAYS = 7
PRUNE_INTERVAL = 3600  # seconds

def collect_metrics() -> dict:
    """Non-blocking snapshot. CPU is the average since the previous call."""
    return {
        "cpu": psutil.cpu_percent(interval=None),
        "ram": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage('/').percent,
    }

def build_alerts(values: dict, config: dict, last_alert_time: dict, now: float,
                 episode_ids: dict | None = None, held: set[str] | None = None) -> list[dict]:
    """
    One threshold_alert per metric over its threshold, rate-limited per metric.
    episode_ids maps a metric to its open episode, so a client can tell the first alert
    of an episode from its repeats. Metrics in `held` are not announced: their first alert
    waits for the top-process scan, or they are muted.
    """
    alerts = []
    episode_ids = episode_ids or {}
    held = held or set()
    for metric, config_key, label in ALERT_METRICS:
        threshold = config.get(config_key)
        current = values[metric]
        if threshold is None or current <= threshold or metric in held:
            continue
        if now - last_alert_time.get(metric, 0) < ALERT_COOLDOWN:
            continue
        last_alert_time[metric] = now
        alerts.append({
            "type": "threshold_alert",
            "level": "critical" if current >= CRITICAL_LEVEL else "warning",
            "message": f"{label} exceeded {threshold}% threshold. Current: {current}%.",
            "timestamp": int(now),
            "metric": metric,
            "episode_id": episode_ids.get(metric),
        })
    return alerts

def build_threshold_alert(metric: str, label: str, threshold: float, current: float, now: float,
                          episode_id: str | None) -> dict:
    return {
        "type": "threshold_alert",
        "level": "critical" if current >= CRITICAL_LEVEL else "warning",
        "message": f"{label} exceeded {threshold}% threshold. Current: {current}%.",
        "timestamp": int(now),
        "metric": metric,
        "episode_id": episode_id,
    }

def build_process_alert(episode: Episode, now: float) -> dict:
    """The one alert a suspicious-process episode raises, when it starts."""
    process = episode.top_process
    return {
        "type": "threshold_alert",
        "level": episode.level,
        "message": f"Suspicious process: {process['name']} (PID {process['pid']}) is using "
                   f"{process['value']:.0f}% CPU with no window.",
        "timestamp": int(now),
        "metric": episode.metric,
        "episode_id": episode.id,
    }

def build_metrics_update(values: dict) -> dict:
    return {
        "type": "metrics_update",
        "data": {
            "cpu_percent": values["cpu"],
            "ram_percent": values["ram"],
            "disk_percent": values["disk"],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    }

aggregator = MinuteAggregator()
episodes = EpisodeTracker()
watcher = ProcessWatcher()

# The most recent sample, for the readings stored with an episode that the process watch starts
latest_values = {"cpu": 0.0, "ram": 0.0, "disk": 0.0}

# Tasks that outlive the cycle which started them. Held here so they are not garbage collected.
background_tasks: set[asyncio.Task] = set()

last_alert_time: dict = {}

async def announce_alert(event: str, episode: Episode) -> None:
    """
    Tells connected windows that a stored episode changed, so the history page needs no polling.
    The row is read back and sent in the API's shape: clients see what is stored, not what was meant.
    Never raises: the history is already written, and a window that missed this reloads on reconnect.
    """
    if not manager.active_connections or episode.id is None:
        return
    try:
        row = await get_alert_event(episode.id)
        if row:
            await manager.broadcast({"type": "alert_event", "event": event, "alert": serialize_alert(row)})
    except Exception as e:  # noqa: BLE001 - announcing and looking up are best effort: the alert is already stored
        logger.error(f"Failed to announce a {episode.metric} alert: {e}")

async def resolve_first_alert(episode: Episode) -> None:
    """
    Finds the episode's largest consumer, then decides its first alert: muted when that process
    is on the never-alert list, otherwise announced now. A failed scan still announces it.
    """
    top = None
    try:
        top = await lookup_top_process(episode.metric)
        if top:
            episode.top_process = top
            if episode.id and await set_alert_top_process(episode.id, top["name"], top["pid"], top["value"]):
                await announce_alert("updated", episode)
    except Exception as e:  # noqa: BLE001 - announcing and looking up are best effort: the alert is already stored
        logger.error(f"Failed to find the top process for a {episode.metric} alert: {e}")

    if top and is_alert_muted(top["name"]):
        episode.muted = True
        if episode.id and await mark_alert_muted(episode.id):
            await announce_alert("updated", episode)

    episode.alert_pending = False
    if not episode.muted and manager.active_connections:
        label = next(label for metric, _, label in ALERT_METRICS if metric == episode.metric)
        now = time.time()
        last_alert_time[episode.metric] = now
        await manager.broadcast(build_threshold_alert(
            episode.metric, label, episode.threshold, latest_values[episode.metric], now, episode.id))

def schedule_first_alert(episode: Episode) -> None:
    if not episode.alert_pending or episode.resolving:
        return
    episode.resolving = True
    # The scan takes over a second. Its own task keeps the 2-second sampling loop on time.
    task = asyncio.create_task(resolve_first_alert(episode))
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)

async def store_episode_start(episode: Episode) -> None:
    episode.id = await open_alert_event(
        episode.metric, episode.level, episode.threshold, utc_text(episode.started_at),
        episode.peak_value, episode.readings, episode.top_process, muted=episode.muted,
    )
    if episode.id:
        episode.peak_changed = False
        await announce_alert("started", episode)
    schedule_first_alert(episode)

async def store_episode_changes(changes: list[EpisodeChange]) -> None:
    """Writes episode starts and ends as they happen. Higher peaks wait for store_episode_peaks."""
    for change in changes:
        episode = change.episode
        if change.kind == "started":
            await store_episode_start(episode)
        elif change.kind == "ended":
            if episode.id is None:
                await store_episode_start(episode)  # Its start could not be written at the time
            if episode.id and await close_alert_event(
                    episode.id, utc_text(episode.ended_at), episode.peak_value, episode.level):
                await announce_alert("ended", episode)

async def store_episode_peaks(open_episodes: list[Episode]) -> None:
    """Writes the peaks that moved. Called once a minute, not per sample, to keep writes low."""
    for episode in open_episodes:
        if episode.id is None:
            await store_episode_start(episode)
        elif episode.peak_changed and await update_alert_event(episode.id, episode.peak_value, episode.level):
            episode.peak_changed = False
            await announce_alert("updated", episode)

async def record_sample(values: dict, now: float) -> None:
    """
    Adds one sample to the history. Runs every cycle, window or no window.
    Never raises: a failed write must not stop the gauges.
    """
    try:
        latest_values.update(values)
        row = aggregator.add(values, now)
        await store_episode_changes(episodes.update(values, ACTIVE_CONFIG, now))
        if row:
            await record_metrics_minute(row)
            await store_episode_peaks(episodes.open_episodes())
    except Exception as e:  # noqa: BLE001 - recording never raises: a failed write must not stop the gauges
        logger.error(f"Failed to record metrics history: {e}")

async def flush_history() -> None:
    """Writes the partial minute and the latest peaks on shutdown, so a clean stop loses nothing."""
    try:
        row = aggregator.flush()
        if row:
            await record_metrics_minute(row)
        await store_episode_peaks(episodes.open_episodes() + watcher.open_episodes())
    except Exception as e:  # noqa: BLE001 - recording never raises: a failed write must not stop the gauges
        logger.error(f"Failed to flush metrics history: {e}")

async def watch_processes_once(now: float) -> None:
    """One scan of the process watch: Tier 4 processes become 'process' alert episodes."""
    processes = await scan_processes()
    changes = watcher.update(processes, latest_values, now)
    await store_episode_changes(changes)
    await store_episode_peaks(watcher.open_episodes())
    for change in changes:
        if change.kind == "started" and not change.episode.muted:
            await manager.broadcast(build_process_alert(change.episode, now))

async def history_pruner():
    """Drops history past its retention, once at start-up and then every hour."""
    while True:
        try:
            # The user's choice of 7, 14 or 30 days. Metrics keep a fixed window.
            await prune_history(METRICS_RETENTION_DAYS, ACTIVE_CONFIG.get("alert_retention_days", 30))
        except Exception as e:  # noqa: BLE001 - a failed pass must not end the background loop
            logger.error(f"Error in history pruner: {e}")

        await asyncio.sleep(PRUNE_INTERVAL)

async def process_watch():
    """
    Background task that scans the processes on a timer. It notices suspicious processes
    without the dashboard open, and keeps every per-process CPU reading recent enough
    for the top-process lookup of a system alert.
    """
    logger.info("Process watch background task started.")
    while True:
        try:
            await watch_processes_once(time.time())
        except Exception as e:  # noqa: BLE001 - a failed pass must not end the background loop
            logger.error(f"Error in process watch: {e}")

        await asyncio.sleep(PROCESS_WATCH_INTERVAL)

async def run_cycle(values: dict, now: float, last_alert_time: dict) -> None:
    """
    One sample: update the gauges, record the history, then raise any alerts.
    Every cycle carries a metrics_update, whatever else happens: the gauges have to keep
    moving while a threshold is exceeded. It goes first so they never wait behind a history
    write, and the alerts go last so each can carry the id of the episode that write stored.
    """
    if manager.active_connections:
        await manager.broadcast(build_metrics_update(values))

    await record_sample(values, now)

    if manager.active_connections:
        open_episodes = episodes.open_episodes()
        episode_ids = {episode.metric: episode.id for episode in open_episodes}
        held = {episode.metric for episode in open_episodes if episode.alert_pending or episode.muted}
        for alert in build_alerts(values, ACTIVE_CONFIG, last_alert_time, now, episode_ids, held):
            await manager.broadcast(alert)

async def metrics_broadcaster():
    """Background task to poll psutil, record the history and broadcast to WS clients."""
    logger.info("Metrics broadcaster background task started.")

    while True:
        try:
            # Sample every cycle, even with no clients, so the CPU average always covers one interval
            values = collect_metrics()
            now = time.time()
            await run_cycle(values, now, last_alert_time)
        except Exception as e:  # noqa: BLE001 - a failed send or background pass is logged, and the connection or loop carries on
            logger.error(f"Error in metrics broadcaster: {e}")

        await asyncio.sleep(BROADCAST_INTERVAL)

def port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(1)
        return probe.connect_ex((HOST, PORT)) == 0

def run_ws_server():
    """Runs the Uvicorn server. Designed to be called in a separate thread."""
    # Claude Desktop starts its own copy of main.py for the MCP stdio transport while a
    # standalone server may already be serving the dashboard. Only one of them can own the port.
    if port_in_use():
        logger.info(f"Port {PORT} is already served by another KavanMCP instance. This instance provides the MCP tools only.")
        return

    logger.info(f"Starting FastAPI WebSocket server on {HOST}:{PORT}.")
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
