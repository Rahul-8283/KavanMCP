import asyncio
import json
from datetime import datetime, timezone

import psutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pydantic import BaseModel, Field
from typing import Optional
from utils.logger import logger
from tools.list_processes import list_processes_logic
from config.settings_manager import load_config, update_config
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

app = FastAPI(title="KavanMCP WebSocket Server")

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": exc.errors()})

# Allow the Tauri React frontend to query this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    json_str = list_processes_logic()
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
    theme: Optional[str] = None
    sound_alerts: Optional[bool] = None

@app.post("/api/update_thresholds")
async def update_thresholds(payload: ConfigUpdate):
    """Phase 5 REST Endpoint: Partially updates the active config and persists it."""
    # Exclude unset fields so we only merge what was sent
    update_data = payload.dict(exclude_unset=True)
    if not update_data:
        return {"status": "ignored", "message": "No valid data provided."}
        
    new_config = update_config(update_data)
    return {"status": "success", "config": new_config}

async def metrics_broadcaster():
    """Background task to poll psutil and broadcast to WS clients."""
    logger.info("Metrics broadcaster background task started.")
    while True:
        try:
            if manager.active_connections:
                # Poll metrics
                cpu_percent = psutil.cpu_percent(interval=0.1)
                ram = psutil.virtual_memory()
                ram_percent = ram.percent
                disk = psutil.disk_usage('/')
                disk_percent = disk.percent
                
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
