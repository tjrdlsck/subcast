import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from backend.services.connection_manager import manager, ConnectionManager
from backend.services.bible_service import db_helper, BibleDatabaseHelper
from backend.services.praise_service import praise_db, PraiseDatabaseHelper
from backend.services.background_service import (
    load_bg_meta, save_bg_meta, generate_thumbnail_ffmpeg, cleanup_trash_backgrounds,
    backgrounds_dir, meta_file
)
from backend.services.websocket_handler import handle_websocket_session
from backend.routers.system import CURRENT_VERSION, GITHUB_REPO

from backend.routers.backgrounds import router as backgrounds_router
from backend.routers.praise import router as praise_router
from backend.routers.bible import router as bible_router
from backend.routers.templates import router as templates_router
from backend.routers.system import router as system_router
from backend.routers.projects import router as projects_router
from backend.routers.monitor import router as monitor_router

from backend.services.migration_service import migrate_legacy_db_if_needed
from backend.database import APP_DATA_DIR

logger = logging.getLogger("subcast")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        migrate_legacy_db_if_needed(APP_DATA_DIR)
    except Exception as e:
        logger.warning(f"마이그레이션 실행 중 경고: {e}")
    await manager.initialize()
    yield


app = FastAPI(title="Subcast Backend", version=CURRENT_VERSION, lifespan=lifespan)

# 라우터 등록
app.include_router(backgrounds_router)
app.include_router(praise_router)
app.include_router(bible_router)
app.include_router(templates_router)
app.include_router(system_router)
app.include_router(projects_router)
app.include_router(monitor_router)

import os
import sys
from pathlib import Path

def get_base_dir() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(getattr(sys, '_MEIPASS', os.path.dirname(sys.executable)))
    return Path(__file__).resolve().parent.parent

STATIC_FRONTEND_DIR = get_base_dir() / "frontend"

from backend.services.background_service import backgrounds_dir

# 정적 파일 서빙
app.mount("/static/backgrounds", StaticFiles(directory=str(backgrounds_dir)), name="backgrounds")
app.mount("/static", StaticFiles(directory=str(STATIC_FRONTEND_DIR)), name="static")


@app.get("/")
async def get_index():
    return RedirectResponse(url="/static/index.html")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, role: str = Query(..., pattern="^(presenter|editor|viewer)$")):
    await handle_websocket_session(websocket, role)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
