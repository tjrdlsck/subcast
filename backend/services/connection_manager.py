import asyncio
import json
import logging
import math
import uuid
from typing import Dict, Set, List, Optional
from weakref import WeakKeyDictionary
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
        self._send_locks = WeakKeyDictionary()
        self._thumbnail_tasks: Dict[int, asyncio.Task] = {}

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
            if self.project_data and role != "presenter":
                self.project_data.templates = await load_global_templates()

            # 편집기와 송출 제어는 슬라이드 정보를 먼저 받고 썸네일을 별도 동기화합니다.
            project_data = self.project_data.model_dump() if self.project_data else {}
            thumbnails = {}
            slides = project_data.get("slides", [])
            live_slide_id = (project_data.get("settings") or {}).get("currentLiveSlideId")
            thumbnail_sync_id = uuid.uuid4().hex
            if role in {"editor", "presenter"}:
                for slide in slides:
                    thumbnail = slide.get("thumbnail")
                    if thumbnail:
                        thumbnails[slide["id"]] = thumbnail
                    slide["thumbnail"] = None
            if role == "presenter":
                project_data["templates"] = []

            # 최초 연결 시, 현재 캐시된 전체 데이터를 전송하여 동기화
            initial_payload = {
                "type": "INITIAL_SYNC",
                "data": project_data,
                "lockedSlides": self.locked_slides,
                "historyCount": len(self.project_history),
                "thumbnailsPending": bool(thumbnails),
                "thumbnailSyncId": thumbnail_sync_id,
            }
            await self.send_json(websocket, initial_payload)
            if thumbnails:
                slide_indexes = {slide["id"]: index for index, slide in enumerate(slides)}
                live_index = slide_indexes.get(live_slide_id, 0)
                prioritized_ids = sorted(
                    thumbnails,
                    key=lambda slide_id: (abs(slide_indexes.get(slide_id, 0) - live_index), slide_indexes.get(slide_id, 0)),
                )
                priority_count = 12
                priority_items = prioritized_ids[:priority_count]
                remaining_items = prioritized_ids[priority_count:]
                batch_count = 1 + math.ceil(len(remaining_items) / 64)
                first_batch = {slide_id: thumbnails[slide_id] for slide_id in priority_items}
                await self.send_json(websocket, {
                    "type": "THUMBNAILS_SYNC",
                    "projectId": project_data.get("id"),
                    "thumbnailSyncId": thumbnail_sync_id,
                    "thumbnails": first_batch,
                    "batchIndex": 0,
                    "batchCount": batch_count,
                })
                if remaining_items:
                    task = asyncio.create_task(self._send_thumbnail_batches(
                        websocket,
                        project_data.get("id"),
                        thumbnail_sync_id,
                        thumbnails,
                        remaining_items,
                        batch_count,
                    ))
                    self._thumbnail_tasks[id(websocket)] = task

        else:
            await websocket.close(code=4000, reason="Invalid role parameter")

    async def _send_thumbnail_batches(self, websocket, project_id, thumbnail_sync_id, thumbnails, slide_ids, batch_count):
        try:
            for batch_index, start in enumerate(range(0, len(slide_ids), 64), start=1):
                batch = {slide_id: thumbnails[slide_id] for slide_id in slide_ids[start:start + 64]}
                await self.send_json(websocket, {
                    "type": "THUMBNAILS_SYNC",
                    "projectId": project_id,
                    "thumbnailSyncId": thumbnail_sync_id,
                    "thumbnails": batch,
                    "batchIndex": batch_index,
                    "batchCount": batch_count,
                })
                await asyncio.sleep(0)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.debug(f"Thumbnail sync stopped for disconnected client: {e}")
        finally:
            if self._thumbnail_tasks.get(id(websocket)) is asyncio.current_task():
                self._thumbnail_tasks.pop(id(websocket), None)

    async def send_text(self, websocket: WebSocket, payload: str):
        lock = self._send_locks.get(websocket)
        if lock is None:
            lock = asyncio.Lock()
            self._send_locks[websocket] = lock
        async with lock:
            await websocket.send_text(payload)

    async def send_json(self, websocket: WebSocket, message: dict):
        await self.send_text(websocket, json.dumps(message))

    def disconnect(self, websocket: WebSocket, role: str):
        if role in self.sessions and websocket in self.sessions[role]:
            self.sessions[role].remove(websocket)
            logger.info(f"Client disconnected: role={role}, total_{role}s={len(self.sessions[role])}")
        
        # 해당 웹소켓 연결이 가지고 있던 모든 슬라이드 편집 락 해제
        task = self._thumbnail_tasks.pop(id(websocket), None)
        if task and not task.done():
            task.cancel()
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
                    await self.send_text(ws, payload)
                except Exception as e:
                    logger.error(f"Error broadcasting to {role}: {e}")
        else:
            for r, wss in self.sessions.items():
                for ws in list(wss):
                    try:
                        await self.send_text(ws, payload)
                    except Exception as e:
                        logger.error(f"Error broadcasting to {r}: {e}")


manager = ConnectionManager()
