from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.connection_manager import manager
from backend.services.tag_service import create_tag, delete_tag, get_tags, rename_tag


router = APIRouter(prefix="/api/tags", tags=["tags"])


class MoodTagRequest(BaseModel):
    name: str


async def _broadcast_tags() -> None:
    await manager.broadcast({"type": "MOOD_TAGS_UPDATED", "tags": get_tags()})


@router.get("")
async def list_mood_tags():
    return get_tags()


@router.post("")
async def add_mood_tag(request: MoodTagRequest):
    try:
        tag = create_tag(request.name)
        await _broadcast_tags()
        return tag
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{tag_id}")
async def update_mood_tag(tag_id: str, request: MoodTagRequest):
    try:
        tag = rename_tag(tag_id, request.name)
        await _broadcast_tags()
        return tag
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{tag_id}")
async def remove_mood_tag(tag_id: str):
    try:
        result = delete_tag(tag_id)
        await _broadcast_tags()
        return result
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
