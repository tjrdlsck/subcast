import json
import urllib.parse
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Response
from pydantic import BaseModel

from backend.services.praise_service import praise_db

router = APIRouter(prefix="/api/praise", tags=["praise"])


class PraiseSongSaveRequest(BaseModel):
    id: Optional[int] = None
    title: str
    lyrics: str
    mood: Optional[str] = "기본/일반"
    moods: Optional[List[str]] = None
    original_title: Optional[str] = None


class PraiseSongDeleteRequest(BaseModel):
    ids: Optional[List[int]] = None
    titles: Optional[List[str]] = None


@router.get("/search")
async def search_praise_songs(query: str = Query("")):
    try:
        return praise_db.search_songs(query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save")
async def save_praise_song(req: PraiseSongSaveRequest):
    try:
        if not req.title or not req.title.strip() or not req.lyrics or not req.lyrics.strip():
            raise HTTPException(status_code=400, detail="제목과 가사를 모두 입력해 주세요.")
        target_mood = req.mood or (req.moods[0] if req.moods else "기본/일반")
        praise_db.save_song(req.title.strip(), req.lyrics, song_id=req.id, original_title=req.original_title, mood=target_mood)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/delete")
async def delete_praise_songs(req: PraiseSongDeleteRequest):
    try:
        if not req.ids and not req.titles:
            raise HTTPException(status_code=400, detail="삭제할 찬양곡을 지정해 주세요.")
        count = praise_db.delete_songs(song_ids=req.ids, titles=req.titles)
        return {"status": "success", "deleted_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export")
async def export_praise_songs(ids: Optional[str] = Query(None)):
    try:
        if ids:
            id_list = [int(i.strip()) for i in ids.split(",") if i.strip().isdigit()]
            songs = praise_db.get_songs_by_ids(id_list)
        else:
            songs = praise_db.get_all_songs()
        
        if not songs:
            raise HTTPException(status_code=404, detail="내보낼 찬양 데이터가 없습니다.")

        export_data = [{"title": s["title"], "lyrics": s["lyrics"]} for s in songs]
        
        if len(songs) == 1:
            safe_title = "".join(c for c in songs[0]["title"] if c.isalnum() or c in (' ', '_', '-')).rstrip()
            file_name = f"praise_{safe_title}.json"
        else:
            file_name = "praise_songs.json"

        encoded_filename = urllib.parse.quote(file_name)
        json_bytes = json.dumps(export_data, indent=2, ensure_ascii=False).encode('utf-8')
        return Response(
            content=json_bytes,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import")
async def import_praise_songs(file: UploadFile = File(...)):
    try:
        content = await file.read()
        raw = json.loads(content.decode('utf-8'))
        if not isinstance(raw, list):
            raise HTTPException(status_code=400, detail="올바른 찬양 데이터 형식(JSON 배열)이 아닙니다.")
        imported_count = praise_db.import_songs(raw)
        return {"status": "success", "imported_count": imported_count}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="유효하지 않은 JSON 파일입니다.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
