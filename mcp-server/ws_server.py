import asyncio
import socket
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal, Optional

import psutil
import uvicorn
from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config.settings_manager import ACTIVE_CONFIG, load_config, update_config
from database.db import (
    close_alert_event,
    open_alert_event,
    record_metrics_minute,
    set_alert_top_process,
    update_alert_event,
)
from handlers.approval_handler import stage_termination
from handlers.history_recorder import (
    ALERT_METRICS,
    CRITICAL_LEVEL,
    Episode,
    EpisodeChange,
    EpisodeTracker,
    MinuteAggregator,
)
from handlers.process_watch import TOP_PROCESS_FIELDS, lookup_top_process
from handlers.termination_handler import execute_approved_termination
from tools.list_processes import list_processes_logic
from utils.logger import logger
from utils.timefmt import utc_text


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The first cpu_percent(interval=None) call only sets the baseline and returns 0.0
    psutil.cpu_percent(interval=None)
    broadcaster = asyncio.create_task(metrics_broadcaster())
    yield
    broadcaster.cancel()
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
            except Exception:
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
    except Exception:
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
    cpu_threshold: Optional[int] = Field(None, ge=0, le=100)
    ram_threshold: Optional[int] = Field(None, ge=0, le=100)
    disk_threshold: Optional[int] = Field(None, ge=0, le=100)
    theme: Optional[Literal["dark", "light"]] = None
    sound_alerts: Optional[bool] = None

@app.post("/api/update_thresholds")
async def update_thresholds(payload: ConfigUpdate):
    """Phase 5 REST Endpoint: Partially updates the active config and persists it."""
    # Only merge fields that were sent with a value; an explicit null means "no change"
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        return {"status": "ignored", "message": "No valid data provided."}
        
    new_config = update_config(update_data)
    return {"status": "success", "config": new_config}

class PidRequest(BaseModel):
    pid: int = Field(..., ge=0)

# Maps termination statuses to HTTP codes. The UI reads `detail.code` for its messages.
KILL_HTTP_STATUS = {
    "tier1_blocked": 403,
    "self_protected": 403,
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
BROADCAST_INTERVAL = 2.0  # seconds

def collect_metrics() -> dict:
    """Non-blocking snapshot. CPU is the average since the previous call."""
    return {
        "cpu": psutil.cpu_percent(interval=None),
        "ram": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage('/').percent,
    }

def build_alerts(values: dict, config: dict, last_alert_time: dict, now: float) -> list[dict]:
    """Phase 6: one threshold_alert per metric over its threshold, rate-limited per metric."""
    alerts = []
    for metric, config_key, label in ALERT_METRICS:
        threshold = config.get(config_key)
        current = values[metric]
        if threshold is None or current <= threshold:
            continue
        if now - last_alert_time.get(metric, 0) < ALERT_COOLDOWN:
            continue
        last_alert_time[metric] = now
        alerts.append({
            "type": "threshold_alert",
            "level": "critical" if current >= CRITICAL_LEVEL else "warning",
            "message": f"{label} exceeded {threshold}% threshold. Current: {current}%.",
            "timestamp": int(now)
        })
    return alerts

def build_messages(values: dict, config: dict, last_alert_time: dict, now: float) -> list[dict]:
    """
    Every cycle carries a metrics_update, followed by any alerts. Alerts must never
    replace the update: the gauges have to keep moving while a threshold is exceeded.
    """
    metrics_update = {
        "type": "metrics_update",
        "data": {
            "cpu_percent": values["cpu"],
            "ram_percent": values["ram"],
            "disk_percent": values["disk"],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    }
    return [metrics_update, *build_alerts(values, config, last_alert_time, now)]

aggregator = MinuteAggregator()
episodes = EpisodeTracker()

# Tasks that outlive the cycle which started them. Held here so they are not garbage collected.
background_tasks: set[asyncio.Task] = set()

async def attach_top_process(episode: Episode) -> None:
    """Scans for the largest consumer of the episode's metric and stores it on the row."""
    try:
        top = await lookup_top_process(episode.metric)
        if top:
            episode.top_process = top
            await set_alert_top_process(episode.id, top["name"], top["pid"], top["value"])
    except Exception as e:
        logger.error(f"Failed to find the top process for a {episode.metric} alert: {e}")

async def store_episode_start(episode: Episode) -> None:
    episode.id = await open_alert_event(
        episode.metric, episode.level, episode.threshold, utc_text(episode.started_at),
        episode.peak_value, episode.readings, episode.top_process,
    )
    if episode.id:
        episode.peak_changed = False
        if episode.metric in TOP_PROCESS_FIELDS and episode.top_process is None:
            # The scan takes over a second. Its own task keeps the 2-second sampling loop on time.
            task = asyncio.create_task(attach_top_process(episode))
            background_tasks.add(task)
            task.add_done_callback(background_tasks.discard)

async def store_episode_changes(changes: list[EpisodeChange]) -> None:
    """Writes episode starts and ends as they happen. Higher peaks wait for store_episode_peaks."""
    for change in changes:
        episode = change.episode
        if change.kind == "started":
            await store_episode_start(episode)
        elif change.kind == "ended":
            if episode.id is None:
                await store_episode_start(episode)  # Its start could not be written at the time
            if episode.id:
                await close_alert_event(episode.id, utc_text(episode.ended_at), episode.peak_value, episode.level)

async def store_episode_peaks(open_episodes: list[Episode]) -> None:
    """Writes the peaks that moved. Called once a minute, not per sample, to keep writes low."""
    for episode in open_episodes:
        if episode.id is None:
            await store_episode_start(episode)
        elif episode.peak_changed and await update_alert_event(episode.id, episode.peak_value, episode.level):
            episode.peak_changed = False

async def record_sample(values: dict, now: float) -> None:
    """
    Adds one sample to the history. Runs every cycle, window or no window.
    Never raises: a failed write must not stop the gauges.
    """
    try:
        row = aggregator.add(values, now)
        await store_episode_changes(episodes.update(values, ACTIVE_CONFIG, now))
        if row:
            await record_metrics_minute(row)
            await store_episode_peaks(episodes.open_episodes())
    except Exception as e:
        logger.error(f"Failed to record metrics history: {e}")

async def flush_history() -> None:
    """Writes the partial minute and the latest peaks on shutdown, so a clean stop loses nothing."""
    try:
        row = aggregator.flush()
        if row:
            await record_metrics_minute(row)
        await store_episode_peaks(episodes.open_episodes())
    except Exception as e:
        logger.error(f"Failed to flush metrics history: {e}")

async def metrics_broadcaster():
    """Background task to poll psutil, record the history and broadcast to WS clients."""
    logger.info("Metrics broadcaster background task started.")
    last_alert_time: dict = {}

    while True:
        try:
            # Sample every cycle, even with no clients, so the CPU average always covers one interval
            values = collect_metrics()
            now = time.time()
            await record_sample(values, now)
            if manager.active_connections:
                for message in build_messages(values, ACTIVE_CONFIG, last_alert_time, now):
                    await manager.broadcast(message)
        except Exception as e:
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
