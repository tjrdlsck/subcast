import json
import logging
import uuid
import random
from typing import Dict, List, Set
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path

from backend.schemas import ProjectData, SystemSettings, Slide
from backend.storage import load_project_data, save_project_data

# 로그 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Subcast")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await manager.initialize()
    yield
    # shutdown

app = FastAPI(title="Subcast API", version="1.4", lifespan=lifespan)

# 정적 파일 디렉토리 설정 (없으면 임시 생성)
frontend_dir = Path("frontend")
frontend_dir.mkdir(exist_ok=True)

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
        self.project_data: ProjectData = None

    async def initialize(self):
        """저장소로부터 데이터를 읽어 캐싱합니다."""
        self.project_data = await load_project_data()

    async def connect(self, websocket: WebSocket, role: str):
        await websocket.accept()
        if role in self.sessions:
            self.sessions[role].add(websocket)
            logger.info(f"Client connected: role={role}, total_{role}s={len(self.sessions[role])}")
            
            # 최초 연결 시, 현재 캐시된 전체 데이터를 전송하여 동기화
            initial_payload = {
                "type": "INITIAL_SYNC",
                "data": self.project_data.model_dump(),
                "lockedSlides": self.locked_slides
            }
            await websocket.send_text(json.dumps(initial_payload))
        else:
            await websocket.close(code=4000, reason="Invalid role parameter")

    def disconnect(self, websocket: WebSocket, role: str):
        if role in self.sessions and websocket in self.sessions[role]:
            self.sessions[role].remove(websocket)
            logger.info(f"Client disconnected: role={role}, total_{role}s={len(self.sessions[role])}")
        
        # 해당 웹소켓 연결이 가지고 있던 모든 슬라이드 편집 락 해제
        # 편의상 websocket 메모리 주소나 해시값을 식별자로 활용할 수 있음
        ws_id = str(id(websocket))
        released_slides = []
        for slide_id, owner_id in list(self.locked_slides.items()):
            if owner_id == ws_id:
                del self.locked_slides[slide_id]
                released_slides.append(slide_id)
        
        return released_slides

    async def broadcast(self, message: dict, role: str = None):
        """특정 역할의 클라이언트들에게만 전송하거나, role이 지정되지 않으면 전체에게 브로드캐스트합니다."""
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

# 프론트엔드 정적 파일 서빙 등록
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
async def get_index():
    # frontend/index.html이 있으면 응답하고 없으면 Redirect 또는 HTML 텍스트 응답
    index_file = frontend_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {
        "message": "Subcast Server is running. Access endpoints via /static/index.html",
        "roles": ["/static/presenter.html", "/static/editor.html", "/static/viewer.html"]
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, role: str = Query(..., pattern="^(presenter|editor|viewer)$")):
    await manager.connect(websocket, role)
    ws_id = str(id(websocket))
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            
            if msg_type == "SLIDE_CHANGE":
                # 송출 상태 실시간 피어 동기화 (LWW 규칙 적용)
                new_slide_id = message.get("slideId")
                manager.project_data.settings.currentLiveSlideId = new_slide_id
                await save_project_data(manager.project_data)
                
                # 모든 역할에 슬라이드 체인지 브로드캐스트 (Auto-Scroll 및 Viewer 렌더링 갱신)
                await manager.broadcast({
                    "type": "SLIDE_CHANGE",
                    "slideId": new_slide_id
                })
                logger.info(f"Live slide changed to: {new_slide_id}")

            elif msg_type == "UPDATE_RESOLUTION":
                # 해상도 설정 저장 및 전파
                width = message.get("width")
                height = message.get("height")
                if width and height:
                    manager.project_data.settings.targetWidth = int(width)
                    manager.project_data.settings.targetHeight = int(height)
                    await save_project_data(manager.project_data)
                    
                    # 해상도 변경 소식 브로드캐스트
                    await manager.broadcast({
                        "type": "UPDATE_RESOLUTION",
                        "width": width,
                        "height": height
                    })
                    logger.info(f"Resolution updated: {width}x{height}")

            elif msg_type == "LOCK_SLIDE":
                # 슬라이드 편집 락 요청
                slide_id = message.get("slideId")
                editor_name = message.get("editorName", "편집자")
                
                # 이미 다른 세션에 의해 락이 걸려있는지 확인
                if slide_id in manager.locked_slides and manager.locked_slides[slide_id] != ws_id:
                    # 락 획득 실패 알림
                    await websocket.send_text(json.dumps({
                        "type": "LOCK_FAILED",
                        "slideId": slide_id,
                        "reason": "다른 편집자가 편집 중입니다."
                    }))
                else:
                    manager.locked_slides[slide_id] = ws_id
                    # 락 성공 사실 전파
                    await manager.broadcast({
                        "type": "SLIDE_LOCKED",
                        "slideId": slide_id,
                        "ownerId": ws_id,
                        "editorName": editor_name
                    })
                    logger.info(f"Slide locked: {slide_id} by {editor_name}")

            elif msg_type == "UNLOCK_SLIDE":
                # 슬라이드 편집 락 해제
                slide_id = message.get("slideId")
                if slide_id in manager.locked_slides and manager.locked_slides[slide_id] == ws_id:
                    del manager.locked_slides[slide_id]
                    # 락 해제 사실 전파
                    await manager.broadcast({
                        "type": "SLIDE_UNLOCKED",
                        "slideId": slide_id
                    })
                    logger.info(f"Slide unlocked: {slide_id}")

            elif msg_type == "ADD_SLIDE":
                new_id = f"slide_{uuid.uuid4().hex[:8]}"
                slide_num = len(manager.project_data.slides) + 1
                new_slide = Slide(id=new_id, name=f"새 슬라이드 {slide_num}", elements=[])
                manager.project_data.slides.append(new_slide)
                await save_project_data(manager.project_data)
                await manager.broadcast({
                    "type": "INITIAL_SYNC",
                    "data": manager.project_data.model_dump(),
                    "lockedSlides": manager.locked_slides
                })
                logger.info(f"New slide added: {new_id}")

            elif msg_type == "SAVE_TEMPLATE":
                tpl_data = message.get("template")
                if tpl_data:
                    from backend.schemas import SlideTemplate
                    new_tpl = SlideTemplate.model_validate(tpl_data)
                    for idx, t in enumerate(manager.project_data.templates):
                        if t.id == new_tpl.id:
                            manager.project_data.templates[idx] = new_tpl
                            break
                    else:
                        manager.project_data.templates.append(new_tpl)
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Template saved: {new_tpl.id}")

            elif msg_type == "DELETE_TEMPLATE":
                tpl_id = message.get("templateId")
                if tpl_id:
                    manager.project_data.templates = [t for t in manager.project_data.templates if t.id != tpl_id]
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Template deleted: {tpl_id}")

            elif msg_type == "APPLY_TEMPLATE_BULK":
                slide_ids = message.get("slideIds", [])
                template_id = message.get("templateId")
                target_tpl = next((t for t in manager.project_data.templates if t.id == template_id), None)
                if target_tpl and slide_ids:
                    def clone_elements(elems):
                        cloned = []
                        for el in elems:
                            el_dict = el.model_dump()
                            el_dict["id"] = f"elem_{uuid.uuid4().hex[:9]}"
                            if "children" in el_dict and el_dict["children"]:
                                el_dict["children"] = clone_elements(el.children)
                            from backend.schemas import Element
                            cloned.append(Element.model_validate(el_dict))
                        return cloned

                    for idx, s in enumerate(manager.project_data.slides):
                        if s.id in slide_ids:
                            manager.project_data.slides[idx].elements = clone_elements(target_tpl.elements)
                            manager.project_data.slides[idx].thumbnail = target_tpl.thumbnail

                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
            elif msg_type == "REORDER_SLIDES":
                slide_ids = message.get("slideIds", [])
                if slide_ids:
                    slide_map = {s.id: s for s in manager.project_data.slides}
                    new_slides = [slide_map[sid] for sid in slide_ids if sid in slide_map]
                    for s in manager.project_data.slides:
                        if s.id not in slide_ids:
                            new_slides.append(s)
                    manager.project_data.slides = new_slides
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info("Slides reordered and synchronized.")

            elif msg_type == "DELETE_SLIDES":
                slide_ids = message.get("slideIds", [])
                if slide_ids:
                    manager.project_data.slides = [s for s in manager.project_data.slides if s.id not in slide_ids]
                    if not manager.project_data.slides:
                        from backend.schemas import Slide
                        new_id = f"slide_{uuid.uuid4().hex[:8]}"
                        new_slide = Slide(id=new_id, name="새 슬라이드 1", elements=[])
                        manager.project_data.slides.append(new_slide)
                    
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Slides deleted: {slide_ids}")

            elif msg_type == "SAVE_SLIDE":
                # 슬라이드 내용 저장 및 방송 상태 동기화 처리
                slide_data = message.get("slide")
                if not slide_data:
                    continue
                
                slide_id = slide_data.get("id")
                
                # 메모리 및 파일 갱신
                updated_slide = Slide.model_validate(slide_data)
                # 기존 슬라이드 교체
                slides = manager.project_data.slides
                for idx, s in enumerate(slides):
                    if s.id == slide_id:
                        slides[idx] = updated_slide
                        break
                else:
                    slides.append(updated_slide)
                
                await save_project_data(manager.project_data)
                logger.info(f"Slide {slide_id} saved.")

                # 방송 송출 여부에 따른 격리 및 지연 렌더링 처리
                live_slide_id = manager.project_data.settings.currentLiveSlideId
                
                if slide_id == live_slide_id:
                    # 시나리오 A-1: 송출 중인 슬라이드 긴급 수정 (Live Slide Hot-fix)
                    # 뷰어, 편집기, 제어기 모두에게 전파하여 즉시 렌더링 갱신
                    await manager.broadcast({
                        "type": "SLIDE_UPDATED",
                        "slideId": slide_id,
                        "slide": slide_data,
                        "isLive": True
                    })
                    logger.info(f"Live slide updated (Hot-fix) and broadcasted to all: {slide_id}")
                else:
                    # 시나리오 A-2: 비송출(대기 중인) 슬라이드 사전 수정 (Silent Slide Pre-edit)
                    # 뷰어를 제외한 제어기(presenter)와 편집기(editor)에게만 변경 사항 전송
                    await manager.broadcast({
                        "type": "SLIDE_UPDATED",
                        "slideId": slide_id,
                        "slide": slide_data,
                        "isLive": False
                    }, role="presenter")
                    
                    await manager.broadcast({
                        "type": "SLIDE_UPDATED",
                        "slideId": slide_id,
                        "slide": slide_data,
                        "isLive": False
                    }, role="editor")
                    logger.info(f"Silent slide updated (Pre-edit) and broadcasted to presenter & editor: {slide_id}")

    except WebSocketDisconnect:
        released_slides = manager.disconnect(websocket, role)
        # 끊긴 클라이언트가 들고 있던 락 해제 소식 전파
        for slide_id in released_slides:
            await manager.broadcast({
                "type": "SLIDE_UNLOCKED",
                "slideId": slide_id
            })
            logger.info(f"Auto-unlocked slide {slide_id} on client disconnect")
            
    except Exception as e:
        logger.error(f"WebSocket error in {role}: {e}")
        released_slides = manager.disconnect(websocket, role)
        for slide_id in released_slides:
            await manager.broadcast({
                "type": "SLIDE_UNLOCKED",
                "slideId": slide_id
            })
