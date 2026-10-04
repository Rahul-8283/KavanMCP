import asyncio
import json
from datetime import datetime, timezone
import time

import psutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pydantic import BaseModel, Field
from typing import Literal, Optional
from utils.logger import logger
from tools.list_processes import list_processes_logic
from handlers.approval_handler import stage_termination
from handlers.termination_handler import execute_approved_termination
from config.settings_manager import load_config, update_config, ACTIVE_CONFIG
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

app = FastAPI(title="KavanMCP WebSocket Server")

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    # exc.errors() can carry the raw request body as bytes, which is not JSON serialisable
    detail = [{"type": e.get("type"), "loc": list(e.get("loc", ())), "msg": e.get("msg")} for e in exc.errors()]
    return JSONResponse(status_code=400, content={"detail": detail})

# Only the Tauri window may call this API. Any other origin (e.g. a web page open in
# the browser) would otherwise be able to reach the kill endpoints on localhost.
# Dev: Vite runs on 1420. Release (Windows): Tauri serves from tauri.localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

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
            data = await websocket.receive_text()
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

async def metrics_broadcaster():
    """Background task to poll psutil and broadcast to WS clients."""
    logger.info("Metrics broadcaster background task started.")
    
    last_alert_time = {
        "cpu": 0,
        "ram": 0,
        "disk": 0
    }
    ALERT_COOLDOWN = 3.0  # seconds

    while True:
        try:
            if manager.active_connections:
                # Poll metrics
                cpu_percent = psutil.cpu_percent(interval=0.1)
                ram = psutil.virtual_memory()
                ram_percent = ram.percent
                disk = psutil.disk_usage('/')
                disk_percent = disk.percent
                
                # Phase 6: Alert Evaluation
                current_time = time.time()
                
                def get_alert_payload(metric_name, current_val, threshold_val, metric_label):
                    if threshold_val is not None and current_val > threshold_val:
                        if current_time - last_alert_time[metric_name] >= ALERT_COOLDOWN:
                            last_alert_time[metric_name] = current_time
                            level = "critical" if current_val >= 95 else "warning"
                            return {
                                "type": "threshold_alert",
                                "level": level,
                                "message": f"{metric_label} exceeded {threshold_val}% threshold. Current: {current_val}%.",
                                "timestamp": int(current_time)
                            }
                    return None

                cpu_alert = get_alert_payload("cpu", cpu_percent, ACTIVE_CONFIG.get("cpu_threshold"), "CPU")
                ram_alert = get_alert_payload("ram", ram_percent, ACTIVE_CONFIG.get("ram_threshold"), "Memory")
                disk_alert = get_alert_payload("disk", disk_percent, ACTIVE_CONFIG.get("disk_threshold"), "Disk")

                alerts = [a for a in (cpu_alert, ram_alert, disk_alert) if a]

                if alerts:
                    # Instead of a standard metrics_update, the server pushes a specific alert message
                    for alert_payload in alerts:
                        await manager.broadcast(alert_payload)
                else:
                    # Standard metrics broadcast only if no alerts triggered this cycle
                    payload = {
                        "type": "metrics_update",
                        "data": {
                            "cpu_percent": cpu_percent,
                            "ram_percent": ram_percent,
                            "disk_percent": disk_percent,
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                    }
                    await manager.broadcast(payload)

        except Exception as e:
            logger.error(f"Error in metrics broadcaster: {e}")
        
        # Sleep ~1.9s so total loop time (with 0.1s CPU interval) is ~2.0s
        await asyncio.sleep(1.9)

@app.on_event("startup")
async def startup_event():
    # Start the broadcaster when the FastAPI app starts
    asyncio.create_task(metrics_broadcaster())

def run_ws_server():
    """Runs the Uvicorn server. Designed to be called in a separate thread."""
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
