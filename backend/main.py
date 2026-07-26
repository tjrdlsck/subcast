import json
import logging
import uuid
from typing import Dict, List, Set, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path

from backend.schemas import ProjectData, SystemSettings, Slide, ProjectCreateRequest, ProjectListItem
from backend.storage import (
    load_project_data, save_project_data, list_projects,
    create_project, delete_project, get_active_project_id, set_active_project_id,
    save_global_templates
)

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
        # 디자인 템플릿 일괄 적용 이전 히스토리 스냅샷 저장 스택 (최대 5개)
        self.project_history: List[dict] = []

    def push_history(self):
        """현재 프로젝트 데이터를 깊은 복사하여 히스토리 스택에 보관합니다."""
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
            
            # 최초 연결 시, 현재 캐시된 전체 데이터를 전송하여 동기화
            initial_payload = {
                "type": "INITIAL_SYNC",
                "data": self.project_data.model_dump(),
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

# 프론트엔드 정적 파일 서빙 등록
app.mount("/static", StaticFiles(directory="frontend"), name="static")

import sqlite3

class BibleDatabaseHelper:
    def __init__(self, db_path="GAE_Bible.db"):
        self.db_path = db_path
        self.init_table()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_table(self):
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS bible (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    version_code TEXT NOT NULL DEFAULT 'KRV',
                    book_code TEXT NOT NULL,
                    book_name TEXT NOT NULL,
                    chapter INTEGER NOT NULL,
                    verse INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    title TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_bible_version_book_chap ON bible(version_code, book_code, chapter)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_bible_version_search ON bible(version_code, content)")
            
            # 테이블 데이터 존재 여부 확인 및 자동 파싱 연동
            cursor.execute("SELECT COUNT(*) as cnt FROM bible")
            cnt = cursor.fetchone()["cnt"]
            if cnt == 0:
                try:
                    from parse_bible import parse_and_import_krv
                    parse_and_import_krv(db_path=self.db_path)
                except Exception as e:
                    print(f"자동 성경 파싱 실패: {e}")
            conn.commit()
        finally:
            conn.close()

    def get_books(self, version_code: str = "KRV"):
        conn = self.get_connection()
        cursor = conn.cursor()
        query = """
            SELECT DISTINCT book_name, book_code
            FROM bible 
            WHERE version_code = ?
            ORDER BY id ASC
        """
        try:
            cursor.execute(query, (version_code,))
            rows = cursor.fetchall()
            books_map = {}
            for row in rows:
                books_map[row["book_code"]] = {
                    "book_code": row["book_code"],
                    "book_name": row["book_name"],
                    "max_chapter": 0
                }
            
            cursor.execute("SELECT book_code, MAX(chapter) as max_c FROM bible WHERE version_code = ? GROUP BY book_code", (version_code,))
            for row in cursor.fetchall():
                if row["book_code"] in books_map:
                    books_map[row["book_code"]]["max_chapter"] = row["max_c"]
            
            return list(books_map.values())
        finally:
            conn.close()

    def get_chapter(self, book_code: str, chapter: int, start_verse: int = 1, end_verse: int = 999, version_code: str = "KRV"):
        conn = self.get_connection()
        cursor = conn.cursor()
        query = """
            SELECT verse, content, title, book_name
            FROM bible 
            WHERE version_code = ? AND UPPER(book_code) = UPPER(?) AND chapter = ? AND verse >= ? AND verse <= ?
            ORDER BY verse ASC, id ASC
        """
        try:
            cursor.execute(query, (version_code, book_code, chapter, start_verse, end_verse))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def search_keyword(self, keyword: str, limit: int = 50, version_code: str = "KRV"):
        conn = self.get_connection()
        cursor = conn.cursor()
        query = """
            SELECT book_name, book_code, chapter, verse, content 
            FROM bible 
            WHERE version_code = ? AND content LIKE ?
            ORDER BY id ASC
            LIMIT ?
        """
        try:
            search_param = f"%{keyword}%"
            cursor.execute(query, (version_code, search_param, limit))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

db_helper = BibleDatabaseHelper("GAE_Bible.db")

class PraiseDatabaseHelper:
    def __init__(self, db_path="GAE_Bible.db"):
        self.db_path = db_path
        self.init_table()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_table(self):
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS praise_songs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    lyrics TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_praise_title ON praise_songs(title)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_praise_lyrics ON praise_songs(lyrics)")
            conn.commit()
        finally:
            conn.close()

    def search_songs(self, query_str: str, limit: int = 50):
        conn = self.get_connection()
        cursor = conn.cursor()
        if not query_str.strip():
            sql = "SELECT id, title, lyrics FROM praise_songs ORDER BY title ASC LIMIT ?"
            params = (limit,)
        else:
            sql = """
                SELECT id, title, lyrics 
                FROM praise_songs 
                WHERE title LIKE ? OR lyrics LIKE ?
                ORDER BY title ASC
                LIMIT ?
            """
            param = f"%{query_str}%"
            params = (param, param, limit)
        try:
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def save_song(self, title: str, lyrics: str, song_id: Optional[int] = None, original_title: Optional[str] = None):
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            if song_id is not None:
                cursor.execute("""
                    UPDATE praise_songs 
                    SET title = ?, lyrics = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                """, (title, lyrics, song_id))
            elif original_title is not None:
                cursor.execute("""
                    UPDATE praise_songs 
                    SET title = ?, lyrics = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE title = ?
                """, (title, lyrics, original_title))
            else:
                cursor.execute("SELECT id FROM praise_songs WHERE title = ?", (title,))
                row = cursor.fetchone()
                if row:
                    cursor.execute("""
                        UPDATE praise_songs 
                        SET lyrics = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    """, (lyrics, row["id"]))
                else:
                    cursor.execute("""
                        INSERT INTO praise_songs (title, lyrics) 
                        VALUES (?, ?)
                    """, (title, lyrics))
            conn.commit()
        finally:
            conn.close()

    def delete_songs(self, song_ids: Optional[List[int]] = None, titles: Optional[List[str]] = None):
        conn = self.get_connection()
        cursor = conn.cursor()
        deleted_count = 0
        try:
            if song_ids:
                placeholders = ",".join(["?"] * len(song_ids))
                cursor.execute(f"DELETE FROM praise_songs WHERE id IN ({placeholders})", song_ids)
                deleted_count += cursor.rowcount
            if titles:
                placeholders = ",".join(["?"] * len(titles))
                cursor.execute(f"DELETE FROM praise_songs WHERE title IN ({placeholders})", titles)
                deleted_count += cursor.rowcount
            conn.commit()
            return deleted_count
        finally:
            conn.close()

praise_db = PraiseDatabaseHelper("GAE_Bible.db")

from pydantic import BaseModel
from typing import Optional, List

class PraiseSongSaveRequest(BaseModel):
    id: Optional[int] = None
    title: str
    lyrics: str
    original_title: Optional[str] = None

class PraiseSongDeleteRequest(BaseModel):
    ids: Optional[List[int]] = None
    titles: Optional[List[str]] = None

@app.get("/api/praise/search")
async def search_praise_songs(query: str = Query("")):
    try:
        return praise_db.search_songs(query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/praise/save")
async def save_praise_song(req: PraiseSongSaveRequest):
    try:
        if not req.title.strip() or not req.lyrics.strip():
            raise HTTPException(status_code=400, detail="제목과 가사를 모두 입력해 주세요.")
        praise_db.save_song(req.title.strip(), req.lyrics.strip(), song_id=req.id, original_title=req.original_title)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/praise/delete")
async def delete_praise_songs(req: PraiseSongDeleteRequest):
    try:
        if not req.ids and not req.titles:
            raise HTTPException(status_code=400, detail="삭제할 찬양곡을 지정해 주세요.")
        count = praise_db.delete_songs(song_ids=req.ids, titles=req.titles)
        return {"status": "success", "deleted_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bible/books")
async def get_bible_books(version: str = Query("KRV")):
    try:
        return db_helper.get_books(version_code=version)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bible/read")
async def read_bible(
    book_code: str,
    chapter: int,
    start_verse: int = Query(1),
    end_verse: int = Query(999),
    version: str = Query("KRV")
):
    try:
        verses = db_helper.get_chapter(book_code, chapter, start_verse, end_verse, version_code=version)
        if not verses:
            return {"book_name": "", "book_code": book_code, "chapter": chapter, "verses": []}
        return {
            "book_name": verses[0]["book_name"],
            "book_code": book_code,
            "chapter": chapter,
            "verses": [{"verse": v["verse"], "content": v["content"], "title": v["title"]} for v in verses]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bible/search")
async def search_bible(
    query: str,
    limit: int = Query(50),
    version: str = Query("KRV")
):
    if len(query.strip()) < 2:
        raise HTTPException(status_code=400, detail="검색어는 공백 제외 2글자 이상 입력해 주세요.")
    try:
        results = db_helper.search_keyword(query.strip(), limit, version_code=version)
        return {
            "query": query,
            "total_results": len(results),
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects")
async def get_projects():
    try:
        return await list_projects()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects")
async def create_new_project(req: ProjectCreateRequest):
    try:
        if not req.name or not req.name.strip():
            raise HTTPException(status_code=400, detail="프로젝트 이름을 입력해주세요.")
        proj = await create_project(req.name.strip())
        return proj
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/{project_id}/select")
async def select_project(project_id: str):
    try:
        set_active_project_id(project_id)
        manager.project_data = await load_project_data(project_id)
        manager.project_history.clear()
        manager.locked_slides.clear()
        
        await manager.broadcast({
            "type": "INITIAL_SYNC",
            "data": manager.project_data.model_dump(),
            "lockedSlides": manager.locked_slides
        })
        return {"status": "success", "active_project_id": project_id, "project": manager.project_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/projects/{project_id}")
async def remove_project(project_id: str):
    try:
        new_active_id = await delete_project(project_id)
        if manager.project_data and manager.project_data.id == project_id:
            manager.project_data = await load_project_data(new_active_id)
            manager.project_history.clear()
            manager.locked_slides.clear()
            await manager.broadcast({
                "type": "INITIAL_SYNC",
                "data": manager.project_data.model_dump(),
                "lockedSlides": manager.locked_slides
            })
        return {"status": "success", "active_project_id": new_active_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

            elif msg_type == "SET_BACKGROUND_MODE":
                # 크로마키 배경 모드 동적으로 변경 및 전파
                mode = message.get("mode", "transparent")
                if mode in ["transparent", "chromakey"]:
                    manager.project_data.settings.backgroundMode = mode
                    await save_project_data(manager.project_data)
                    
                    await manager.broadcast({
                        "type": "SET_BACKGROUND_MODE",
                        "mode": mode
                    })
                    logger.info(f"Background mode updated to: {mode}")

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
                
                after_slide_id = message.get("afterSlideId")
                insert_idx = -1
                if after_slide_id:
                    for idx, s in enumerate(manager.project_data.slides):
                        if s.id == after_slide_id:
                            insert_idx = idx + 1
                            break
                            
                if insert_idx != -1:
                    manager.project_data.slides.insert(insert_idx, new_slide)
                else:
                    manager.project_data.slides.append(new_slide)
                    
                await save_project_data(manager.project_data)
                await manager.broadcast({
                    "type": "INITIAL_SYNC",
                    "data": manager.project_data.model_dump(),
                    "lockedSlides": manager.locked_slides
                })
                logger.info(f"New slide added: {new_id} (inserted after {after_slide_id if insert_idx != -1 else 'end'})")

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
                    await save_global_templates(manager.project_data.templates)
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Template saved globally: {new_tpl.id}")

            elif msg_type == "DELETE_TEMPLATE":
                tpl_id = message.get("templateId")
                tpl_ids = message.get("templateIds")
                if tpl_ids:
                    manager.project_data.templates = [t for t in manager.project_data.templates if t.id not in tpl_ids]
                    await save_global_templates(manager.project_data.templates)
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Templates deleted (bulk): {tpl_ids}")
                elif tpl_id:
                    manager.project_data.templates = [t for t in manager.project_data.templates if t.id != tpl_id]
                    await save_global_templates(manager.project_data.templates)
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
                    # 일괄 적용 전 현재 프로젝트 상태 백업
                    manager.push_history()

                    def find_longest_text_element_id(elems):
                        longest_id = None
                        longest_len = -1
                        def traverse(el_list):
                            nonlocal longest_id, longest_len
                            for el in el_list:
                                if el.type == "text":
                                    content_len = len(el.content or "")
                                    if content_len > longest_len:
                                        longest_len = content_len
                                        longest_id = el.id
                                elif el.type == "group" and el.children:
                                    traverse(el.children)
                        traverse(elems)
                        return longest_id

                    target_element_id = message.get("targetElementId")
                    if target_element_id:
                        tpl_longest_id = target_element_id
                    else:
                        tpl_longest_id = find_longest_text_element_id(target_tpl.elements)

                    for idx, s in enumerate(manager.project_data.slides):
                        if s.id in slide_ids:
                            orig_longest_text = ""
                            orig_longest_len = -1
                            def traverse_orig(el_list):
                                nonlocal orig_longest_text, orig_longest_len
                                for el in el_list:
                                    if el.type == "text":
                                        content_len = len(el.content or "")
                                        if content_len > orig_longest_len:
                                            orig_longest_len = content_len
                                            orig_longest_text = el.content or ""
                                    elif el.type == "group" and el.children:
                                        traverse_orig(el.children)
                            traverse_orig(s.elements)

                            def clone_elements(elems):
                                cloned = []
                                for el in elems:
                                    el_dict = el.model_dump()
                                    orig_el_id = el.id
                                    el_dict["id"] = f"elem_{uuid.uuid4().hex[:9]}"
                                    if el.type == "text" and orig_el_id == tpl_longest_id:
                                        el_dict["content"] = orig_longest_text
                                    if "children" in el_dict and el_dict["children"]:
                                        el_dict["children"] = clone_elements(el.children)
                                    from backend.schemas import Element
                                    cloned.append(Element.model_validate(el_dict))
                                return cloned

                            manager.project_data.slides[idx].elements = clone_elements(target_tpl.elements)
                            manager.project_data.slides[idx].thumbnail = None

                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })

            elif msg_type == "ADD_CUSTOM_FONT":
                family = message.get("family")
                url = message.get("url")
                orig_css = message.get("originalCssCode")
                
                if family and url:
                    import os
                    import httpx
                    import urllib.parse
                    import hashlib
                    import re
                    from backend.schemas import CustomFont
                    
                    fonts_dir = os.path.join("frontend", "fonts")
                    os.makedirs(fonts_dir, exist_ok=True)
                    
                    parsed_url = urllib.parse.urlparse(url)
                    orig_filename = os.path.basename(parsed_url.path)
                    ext = os.path.splitext(orig_filename)[1] or ".woff2"
                    
                    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()[:8]
                    safe_family = "".join([c for c in family if c.isalnum() or c in ("-", "_")])
                    filename = f"{safe_family}_{url_hash}{ext}"
                    filepath = os.path.join(fonts_dir, filename)
                    local_url = f"/static/fonts/{filename}"
                    
                    download_success = True
                    if not os.path.exists(filepath):
                        try:
                            logger.info(f"Downloading custom font: {url} -> {filepath}")
                            async with httpx.AsyncClient() as client:
                                response = await client.get(url, timeout=15.0)
                                if response.status_code == 200:
                                    with open(filepath, "wb") as f:
                                        f.write(response.content)
                                else:
                                    logger.error(f"Failed to download font: status {response.status_code}")
                                    download_success = False
                        except Exception as e:
                            logger.error(f"Error downloading font: {e}")
                            download_success = False
                    
                    if download_success:
                        local_css = re.sub(r'url\s*\(\s*[\'"]?([^\'")]+)[\'"]?\s*\)', f"url('{local_url}')", orig_css)
                        new_font = CustomFont(family=family, cssCode=local_css)
                        
                        for idx, f in enumerate(manager.project_data.customFonts):
                            if f.family.lower() == family.lower():
                                manager.project_data.customFonts[idx] = new_font
                                break
                        else:
                            manager.project_data.customFonts.append(new_font)
                            
                        await save_project_data(manager.project_data)
                        await manager.broadcast({
                            "type": "INITIAL_SYNC",
                            "data": manager.project_data.model_dump(),
                            "lockedSlides": manager.locked_slides
                        })
                        logger.info(f"Custom font registered: {family} -> {local_url}")

            elif msg_type == "UNDO_BULK_ACTION":
                if manager.project_history:
                    prev_state = manager.project_history.pop()
                    from backend.schemas import ProjectData
                    manager.project_data = ProjectData.model_validate(prev_state)
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info("Bulk action undone successfully.")
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

            elif msg_type == "ADD_SLIDES_BULK":
                slides_data = message.get("slides", [])
                insert_after_id = message.get("insertAfterId")
                if slides_data:
                    new_slides = [Slide.model_validate(s_data) for s_data in slides_data]
                    
                    insert_idx = -1
                    if insert_after_id:
                        for idx, s in enumerate(manager.project_data.slides):
                            if s.id == insert_after_id:
                                insert_idx = idx
                                break
                                
                    if insert_idx != -1:
                        manager.project_data.slides = (
                            manager.project_data.slides[:insert_idx + 1] + 
                            new_slides + 
                            manager.project_data.slides[insert_idx + 1:]
                        )
                    else:
                        manager.project_data.slides.extend(new_slides)
                        
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Bulk slides added: {len(slides_data)} slides after {insert_after_id}")

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
