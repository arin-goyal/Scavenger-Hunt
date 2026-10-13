import os
import logging
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .detector import YOLODetector
from .game_state import game_manager
from .riddles import riddle_engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("scavenger_hunt")

app = FastAPI(
    title="YOLO Scavenger Hunt",
    description="Tactile minimalist AR scavenger hunt powered by YOLOv8 and GenAI riddles.",
    version="1.0.0"
)

# Enable CORS for local cross-device mobile testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize YOLO model on startup
detector = YOLODetector.get_instance("yolov8n.pt")

# Request Models
class NewGameRequest(BaseModel):
    use_genai: bool = True
    rounds: int = 5

class HintRequest(BaseModel):
    hint_number: int

class VerifyRoundRequest(BaseModel):
    time_remaining: int
    snapshot: Optional[str] = None

class DetectRequest(BaseModel):
    image: str
    target_class: Optional[str] = None
    game_id: Optional[str] = None
    conf_threshold: Optional[float] = 0.35

class AISettingsRequest(BaseModel):
    provider: str  # 'gemini' or 'groq'
    api_key: str

# Endpoints
@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "yolo_classes": len(detector.model.names),
        "active_sessions": len(game_manager.sessions),
        "genai_configured": {
            "gemini": bool(riddle_engine.gemini_api_key),
            "groq": bool(riddle_engine.groq_api_key),
        }
    }

@app.post("/api/game/new")
def new_game(payload: NewGameRequest):
    session = game_manager.create_game(count=payload.rounds, use_genai=payload.use_genai)
    return session.to_client_state()

@app.get("/api/game/{game_id}")
def get_game(game_id: str):
    session = game_manager.get_game(game_id)
    if not session:
        raise HTTPException(status_code=404, detail="Game session not found")
    return session.to_client_state()

@app.post("/api/game/{game_id}/hint")
def request_hint(game_id: str, payload: HintRequest):
    session = game_manager.get_game(game_id)
    if not session or not session.current_round:
        raise HTTPException(status_code=404, detail="Active round not found")
    try:
        session.current_round.unlock_hint(payload.hint_number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return session.to_client_state()

@app.post("/api/game/{game_id}/skip")
def skip_round(game_id: str):
    session = game_manager.get_game(game_id)
    if not session or not session.current_round:
        raise HTTPException(status_code=404, detail="Active round not found")
    
    summary = session.current_round.skip()
    has_next = session.advance_round()
    
    return {
        "round_summary": summary,
        "has_next_round": has_next,
        "game_state": session.to_client_state()
    }

@app.post("/api/game/{game_id}/timeout")
def timeout_round(game_id: str):
    session = game_manager.get_game(game_id)
    if not session or not session.current_round:
        raise HTTPException(status_code=404, detail="Active round not found")
    
    summary = session.current_round.timeout()
    has_next = session.advance_round()
    
    return {
        "round_summary": summary,
        "has_next_round": has_next,
        "game_state": session.to_client_state()
    }

@app.post("/api/game/{game_id}/verify")
def verify_round(game_id: str, payload: VerifyRoundRequest):
    session = game_manager.get_game(game_id)
    if not session or not session.current_round:
        raise HTTPException(status_code=404, detail="Active round not found")
    
    summary = session.current_round.complete(
        time_remaining=payload.time_remaining,
        snapshot=payload.snapshot
    )
    has_next = session.advance_round()

    return {
        "round_summary": summary,
        "has_next_round": has_next,
        "game_state": session.to_client_state()
    }

@app.post("/api/detect")
def detect_objects(payload: DetectRequest):
    target = payload.target_class
    if not target and payload.game_id:
        session = game_manager.get_game(payload.game_id)
        if session and session.current_round:
            target = session.current_round.yolo_class

    result = detector.detect(
        image_data=payload.image,
        target_class=target,
        conf_threshold=payload.conf_threshold or 0.35,
    )
    return result

@app.post("/api/settings/ai")
def set_ai_settings(payload: AISettingsRequest):
    # This endpoint changes process-wide API credentials. Keep it opt-in so a
    # public deployment cannot let any visitor replace the key for everyone.
    if os.getenv("ENABLE_RUNTIME_AI_SETTINGS", "").strip().lower() not in {"1", "true", "yes"}:
        raise HTTPException(
            status_code=403,
            detail="Runtime AI key changes are disabled. Configure GEMINI_API_KEY or GROQ_API_KEY on the server.",
        )
    riddle_engine.set_api_key(payload.provider, payload.api_key)
    return {
        "success": True,
        "provider": payload.provider,
        "active": bool(payload.api_key)
    }

# Mount static files
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/")
    def serve_index():
        index_path = static_dir / "index.html"
        return FileResponse(index_path)
