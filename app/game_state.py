import uuid
import time
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from .riddles import riddle_engine

BASE_POINTS = 1000
TIME_BONUS_PER_SEC = 15
HINT_1_PENALTY = 150
HINT_2_PENALTY = 250
CLEAN_SOLVE_BONUS = 200
DEFAULT_ROUND_TIME = 60  # seconds

class RoundState:
    def __init__(self, round_data: Dict[str, Any]):
        self.round_number: int = round_data.get("round_number", 1)
        self.yolo_class: str = round_data["yolo_class"]
        self.object_name: str = round_data["object_name"]
        self.riddle: str = round_data["riddle"]
        self.hint_1: str = round_data["hint_1"]
        self.hint_2: str = round_data["hint_2"]
        
        self.hints_unlocked: List[int] = []
        self.status: str = "pending"  # pending, active, completed, skipped, timeout
        self.time_allocated: int = DEFAULT_ROUND_TIME
        self.time_remaining: int = DEFAULT_ROUND_TIME
        self.points_awarded: int = 0
        self.points_breakdown: Dict[str, int] = {}
        self.snapshot: Optional[str] = None
        self.start_timestamp: Optional[float] = None

    def start(self):
        self.status = "active"
        self.start_timestamp = time.time()

    def unlock_hint(self, hint_num: int) -> Dict[str, Any]:
        if hint_num not in [1, 2]:
            raise ValueError("Hint must be 1 or 2")
        if hint_num not in self.hints_unlocked:
            self.hints_unlocked.append(hint_num)
        return {
            "unlocked": self.hints_unlocked,
            "hint_1": self.hint_1 if 1 in self.hints_unlocked else None,
            "hint_2": self.hint_2 if 2 in self.hints_unlocked else None,
        }

    def complete(self, time_remaining: int, snapshot: Optional[str] = None) -> Dict[str, Any]:
        self.status = "completed"
        self.time_remaining = max(0, min(self.time_allocated, time_remaining))
        self.snapshot = snapshot

        base = BASE_POINTS
        time_bonus = self.time_remaining * TIME_BONUS_PER_SEC
        hint_penalty = 0
        if 1 in self.hints_unlocked:
            hint_penalty += HINT_1_PENALTY
        if 2 in self.hints_unlocked:
            hint_penalty += HINT_2_PENALTY

        clean_bonus = CLEAN_SOLVE_BONUS if len(self.hints_unlocked) == 0 else 0
        round_total = max(100, base + time_bonus - hint_penalty + clean_bonus)

        self.points_awarded = round_total
        self.points_breakdown = {
            "base": base,
            "time_bonus": time_bonus,
            "hint_penalty": hint_penalty,
            "clean_bonus": clean_bonus,
            "total": round_total,
        }

        return self.to_summary()

    def skip(self) -> Dict[str, Any]:
        self.status = "skipped"
        self.points_awarded = 0
        self.points_breakdown = {
            "base": 0,
            "time_bonus": 0,
            "hint_penalty": 0,
            "clean_bonus": 0,
            "total": 0,
        }
        return self.to_summary()

    def timeout(self) -> Dict[str, Any]:
        self.status = "timeout"
        self.points_awarded = 0
        self.points_breakdown = {
            "base": 0,
            "time_bonus": 0,
            "hint_penalty": 0,
            "clean_bonus": 0,
            "total": 0,
        }
        return self.to_summary()

    def to_client_view(self, reveal_answer: bool = False) -> Dict[str, Any]:
        data = {
            "round_number": self.round_number,
            "riddle": self.riddle,
            "hints_unlocked": self.hints_unlocked,
            "hint_1": self.hint_1 if 1 in self.hints_unlocked else None,
            "hint_2": self.hint_2 if 2 in self.hints_unlocked else None,
            "status": self.status,
            "time_allocated": self.time_allocated,
        }
        if reveal_answer or self.status in ["completed", "skipped", "timeout"]:
            data["object_name"] = self.object_name
            data["yolo_class"] = self.yolo_class
            data["points_awarded"] = self.points_awarded
            data["points_breakdown"] = self.points_breakdown
            data["snapshot"] = self.snapshot
        return data

    def to_summary(self) -> Dict[str, Any]:
        return {
            "round_number": self.round_number,
            "object_name": self.object_name,
            "yolo_class": self.yolo_class,
            "status": self.status,
            "points_awarded": self.points_awarded,
            "points_breakdown": self.points_breakdown,
            "time_remaining": self.time_remaining,
            "hints_used": len(self.hints_unlocked),
            "snapshot": self.snapshot,
        }

class GameSession:
    def __init__(self, game_id: str, rounds_data: List[Dict[str, Any]]):
        self.game_id = game_id
        self.created_at = time.time()
        self.current_round_idx = 0
        self.rounds = [RoundState(r) for r in rounds_data]
        self.is_finished = False
        if self.rounds:
            self.rounds[0].start()

    @property
    def total_score(self) -> int:
        return sum(r.points_awarded for r in self.rounds)

    @property
    def current_round(self) -> Optional[RoundState]:
        if 0 <= self.current_round_idx < len(self.rounds):
            return self.rounds[self.current_round_idx]
        return None

    def advance_round(self) -> bool:
        self.current_round_idx += 1
        if self.current_round_idx < len(self.rounds):
            self.rounds[self.current_round_idx].start()
            return True
        else:
            self.is_finished = True
            return False

    def to_client_state(self) -> Dict[str, Any]:
        cur = self.current_round
        return {
            "game_id": self.game_id,
            "total_rounds": len(self.rounds),
            "current_round_number": (self.current_round_idx + 1) if not self.is_finished else len(self.rounds),
            "is_finished": self.is_finished,
            "total_score": self.total_score,
            "current_round": cur.to_client_view() if cur and not self.is_finished else None,
            "target_yolo_class": cur.yolo_class if cur and not self.is_finished else None,
            "round_history": [r.to_summary() for r in self.rounds if r.status in ["completed", "skipped", "timeout"]],
        }

class GameManager:
    def __init__(self):
        self.sessions: Dict[str, GameSession] = {}

    def create_game(self, count: int = 5, use_genai: bool = True) -> GameSession:
        game_id = str(uuid.uuid4())[:8]
        rounds_data = riddle_engine.generate_game_rounds(count=count, use_genai=use_genai)
        session = GameSession(game_id, rounds_data)
        self.sessions[game_id] = session
        return session

    def get_game(self, game_id: str) -> Optional[GameSession]:
        return self.sessions.get(game_id)

game_manager = GameManager()
