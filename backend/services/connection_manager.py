import json
import logging
from typing import Dict, Set, List, Optional
from fastapi import WebSocket
from backend.schemas import ProjectData
from backend.storage import load_project_data, get_active_project_id, load_global_templates

logger = logging.getLogger("subcast")


class ConnectionManager:
    def __init__(self):
        # 각 역할별 세션 관리
        self.sessions: Dict[str, Set[WebSocket]] = {
            "presenter": set(),
            "editor": set(),
            "viewer": set()
        }
        # 슬라이드 편집 락 상태 관리: slide_id -> client_unique_id (또는 문자열)
        self.locked_slides: Dict[str, str] = {}
        # 서버 메모리 상의 프로젝트 데이터 캐시
        self.project_data: Optional[ProjectData] = None
        # 디자인 템플릿 일괄 적용 이전 히스토리 스냅샷 저장 스택 (최대 5개)
        self.project_history: List[dict] = []

    def push_history(self):
        """현재 프로젝트 데이터를 깊은 복사하여 히스토리 스택에 보관합니다."""
        if self.project_data:
            self.project_history.append(self.project_data.model_dump())
            if len(self.project_history) > 5:
                self.project_history.pop(0)

    async def initialize(self):
        """저장소로부터 데이터를 읽어 캐싱합니다."""
        active_id = get_active_project_id()
        self.project_data = await load_project_data(active_id)

    async def connect(self, websocket: WebSocket, role: str):
        await websocket.accept()
        if role in self.sessions:
            self.sessions[role].add(websocket)
            logger.info(f"Client connected: role={role}, total_{role}s={len(self.sessions[role])}")
            
            # 클라이언트 연결 시 전역 템플릿 최신 목록 동기화
            if self.project_data:
                self.project_data.templates = await load_global_templates()

            # 최초 연결 시, 현재 캐시된 전체 데이터를 전송하여 동기화
            initial_payload = {
                "type": "INITIAL_SYNC",
                "data": self.project_data.model_dump() if self.project_data else {},
                "lockedSlides": self.locked_slides,
                "historyCount": len(self.project_history)
            }
            await websocket.send_text(json.dumps(initial_payload))
        else:
            await websocket.close(code=4000, reason="Invalid role parameter")

    def disconnect(self, websocket: WebSocket, role: str):
        if role in self.sessions and websocket in self.sessions[role]:
            self.sessions[role].remove(websocket)
            logger.info(f"Client disconnected: role={role}, total_{role}s={len(self.sessions[role])}")
        
        # 해당 웹소켓 연결이 가지고 있던 모든 슬라이드 편집 락 해제
        ws_id = str(id(websocket))
        released_slides = []
        for slide_id, owner_id in list(self.locked_slides.items()):
            if owner_id == ws_id:
                del self.locked_slides[slide_id]
                released_slides.append(slide_id)
        
        return released_slides

    async def broadcast(self, message: dict, role: str = None):
        """특정 역할의 클라이언트들에게만 전송하거나, role이 지정되지 않으면 전체에게 브로드캐스트합니다."""
        if message.get("type") == "INITIAL_SYNC":
            message["historyCount"] = len(self.project_history)
        payload = json.dumps(message)
        
        if role:
            targets = list(self.sessions.get(role, []))
            for ws in targets:
                try:
                    await ws.send_text(payload)
                except Exception as e:
                    logger.error(f"Error broadcasting to {role}: {e}")
        else:
            for r, wss in self.sessions.items():
                for ws in list(wss):
                    try:
                        await ws.send_text(payload)
                    except Exception as e:
                        logger.error(f"Error broadcasting to {r}: {e}")


manager = ConnectionManager()
