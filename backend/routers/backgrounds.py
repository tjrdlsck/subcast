import asyncio
import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

from backend.services.background_service import (
    backgrounds_dir,
    load_bg_meta,
    save_bg_meta,
    generate_thumbnail_ffmpeg,
    cleanup_trash_backgrounds,
)

logger = logging.getLogger("subcast")
router = APIRouter(prefix="/api/backgrounds", tags=["backgrounds"])

pending_delete_bg_files = set()


class RenameBackgroundRequest(BaseModel):
    old_name: str
    new_name: str


class DeleteBackgroundsRequest(BaseModel):
    names: List[str]


class DuplicateBackgroundsRequest(BaseModel):
    names: List[str]


async def _async_delete_background_worker(names: List[str]):
    await asyncio.sleep(0.3)
    meta = load_bg_meta()
    meta_changed = False

    for name in names:
        if name in meta:
            meta.pop(name)
            meta_changed = True

        target_path = backgrounds_dir / name
        thumb_path = backgrounds_dir / f"thumb_{target_path.stem}.jpg"

        # 물리 파일 삭제 시도 (최대 15회, 총 3초간 비동기 재시도)
        for attempt in range(15):
            if not target_path.exists():
                break
            try:
                target_path.unlink()
                break
            except Exception:
                try:
                    trash_name = f".trash_{uuid.uuid4().hex}_{name}"
                    trash_path = backgrounds_dir / trash_name
                    target_path.rename(trash_path)
                    try:
                        trash_path.unlink()
                    except Exception:
                        pass
                    break
                except Exception:
                    pass
            await asyncio.sleep(0.2)

        if thumb_path.exists():
            try:
                thumb_path.unlink()
            except Exception:
                pass

        pending_delete_bg_files.discard(name)

    if meta_changed:
        save_bg_meta(meta)
    cleanup_trash_backgrounds()


@router.get("/list")
async def list_background_files():
    files = []
    meta = load_bg_meta()
    meta_updated = False

    if backgrounds_dir.exists():
        for p in backgrounds_dir.glob("*"):
            if p.name == "meta.json" or p.name.startswith("thumb_") or p.name.startswith(".trash_"):
                continue
            if p.suffix.lower() in [".mp4", ".webm", ".mov", ".avi", ".jpg", ".png"]:
                item_meta = meta.get(p.name, {})
                thumb_url = item_meta.get("thumbnailUrl")

                if not thumb_url:
                    filename_no_ext = p.stem
                    if len(filename_no_ext) == 11 and not p.name.startswith("upload_"):
                        thumb_url = f"https://img.youtube.com/vi/{filename_no_ext}/hqdefault.jpg"
                    elif p.suffix.lower() in [".mp4", ".webm", ".mov", ".avi"]:
                        thumb_filename = f"thumb_{p.stem}.jpg"
                        thumb_path = backgrounds_dir / thumb_filename
                        if not thumb_path.exists():
                            if generate_thumbnail_ffmpeg(p, thumb_path):
                                thumb_url = f"/static/backgrounds/{thumb_filename}"
                        else:
                            thumb_url = f"/static/backgrounds/{thumb_filename}"

                    if thumb_url:
                        if p.name not in meta:
                            meta[p.name] = {}
                        meta[p.name]["thumbnailUrl"] = thumb_url
                        meta_updated = True

                files.append({
                    "name": p.name,
                    "title": item_meta.get("title") or (p.stem.split("_", 2)[-1] if p.name.startswith("upload_") else p.name),
                    "url": f"/static/backgrounds/{p.name}",
                    "size": p.stat().st_size,
                    "thumbnailUrl": thumb_url or "",
                    "mood": item_meta.get("mood", "기본/일반"),
                    "moods": item_meta.get("moods", [item_meta.get("mood", "기본/일반")] if item_meta.get("mood") else []),
                    "isDefault": item_meta.get("isDefault", False)
                })

    if meta_updated:
        save_bg_meta(meta)

    return {"files": files}


@router.post("/upload")
async def upload_background_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="파일명이 올바르지 않습니다.")
    
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in [".mp4", ".webm", ".mov", ".avi"]:
        raise HTTPException(status_code=400, detail="동영상 파일(.mp4, .webm 등)만 업로드 가능합니다.")

    unique_name = f"upload_{uuid.uuid4().hex[:8]}_{file.filename}"
    save_path = backgrounds_dir / unique_name
    
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    thumb_filename = f"thumb_{Path(unique_name).stem}.jpg"
    thumb_path = backgrounds_dir / thumb_filename
    thumb_url = ""
    if generate_thumbnail_ffmpeg(save_path, thumb_path):
        thumb_url = f"/static/backgrounds/{thumb_filename}"

    meta = load_bg_meta()
    meta[unique_name] = {
        "thumbnailUrl": thumb_url,
        "title": file.filename
    }
    save_bg_meta(meta)

    return {
        "success": True,
        "filename": unique_name,
        "title": file.filename,
        "videoUrl": f"/static/backgrounds/{unique_name}",
        "thumbnailUrl": thumb_url
    }


@router.post("/rename")
async def rename_background_file(req: RenameBackgroundRequest):
    old_name = req.old_name.strip()
    new_name = req.new_name.strip()

    if not old_name or not new_name:
        raise HTTPException(status_code=400, detail="변경할 파일명을 입력해주세요.")

    old_path = backgrounds_dir / old_name
    if not old_path.exists() or not old_path.is_file():
        raise HTTPException(status_code=404, detail="대상 라이브러리 파일을 찾을 수 없습니다.")

    # 확장자 유지 보정
    ext = old_path.suffix
    if not new_name.lower().endswith(ext.lower()):
        new_name = f"{new_name}{ext}"

    new_path = backgrounds_dir / new_name

    if new_path.exists() and old_path.resolve() != new_path.resolve():
        raise HTTPException(status_code=400, detail="동일한 이름의 파일이 이미 존재합니다.")

    try:
        old_path.rename(new_path)

        old_thumb = backgrounds_dir / f"thumb_{old_path.stem}.jpg"
        new_thumb = backgrounds_dir / f"thumb_{new_path.stem}.jpg"
        if old_thumb.exists():
            try:
                old_thumb.rename(new_thumb)
            except Exception as te:
                logger.warning(f"Failed to rename thumb file: {te}")

        meta = load_bg_meta()
        if old_name in meta:
            item_meta = meta.pop(old_name)
            old_thumb_url = f"/static/backgrounds/thumb_{old_path.stem}.jpg"
            new_thumb_url = f"/static/backgrounds/thumb_{new_path.stem}.jpg"
            if item_meta.get("thumbnailUrl") == old_thumb_url:
                item_meta["thumbnailUrl"] = new_thumb_url
            meta[new_name] = item_meta
            save_bg_meta(meta)
    except Exception as e:
        logger.error(f"Failed to rename background file: {e}")
        raise HTTPException(status_code=500, detail=f"파일명 변경 실패: {str(e)}")

    meta = load_bg_meta()
    item_meta = meta.get(new_name, {})
    thumb_url = item_meta.get("thumbnailUrl", "")

    return {
        "success": True,
        "old_name": old_name,
        "new_name": new_name,
        "videoUrl": f"/static/backgrounds/{new_name}",
        "thumbnailUrl": thumb_url
    }


@router.post("/delete")
async def delete_background_files(req: DeleteBackgroundsRequest):
    if not req.names:
        return {"success": True, "deleted_count": 0}

    valid_names = [n.strip() for n in req.names if n.strip()]
    meta = load_bg_meta()
    meta_changed = False
    async_pending_names = []

    for name in valid_names:
        if name in meta:
            meta.pop(name)
            meta_changed = True

        target_path = backgrounds_dir / name
        thumb_path = backgrounds_dir / f"thumb_{target_path.stem}.jpg"
        is_deleted = False

        if target_path.exists() and target_path.is_file():
            try:
                target_path.unlink()
                is_deleted = True
            except Exception:
                try:
                    trash_name = f".trash_{uuid.uuid4().hex}_{name}"
                    trash_path = backgrounds_dir / trash_name
                    target_path.rename(trash_path)
                    try:
                        trash_path.unlink()
                    except Exception:
                        pass
                    is_deleted = True
                except Exception:
                    pass

        if is_deleted:
            if thumb_path.exists():
                try:
                    thumb_path.unlink()
                except Exception:
                    pass
        else:
            if target_path.exists():
                pending_delete_bg_files.add(name)
                async_pending_names.append(name)

    if meta_changed:
        save_bg_meta(meta)

    if async_pending_names:
        asyncio.create_task(_async_delete_background_worker(async_pending_names))

    cleanup_trash_backgrounds()
    return {"success": True, "deleted_count": len(valid_names)}


@router.post("/duplicate")
async def duplicate_background_files(req: DuplicateBackgroundsRequest):
    if not req.names:
        return {"success": True, "new_files": []}

    meta = load_bg_meta()
    new_files = []

    for name in req.names:
        name = name.strip()
        if not name:
            continue

        src_path = backgrounds_dir / name
        if not src_path.exists() or not src_path.is_file():
            continue

        stem = src_path.stem
        ext = src_path.suffix

        # 사본 파일명 생성
        counter = 0
        while True:
            copy_suffix = "_copy" if counter == 0 else f"_copy({counter})"
            new_name = f"{stem}{copy_suffix}{ext}"
            dst_path = backgrounds_dir / new_name
            if not dst_path.exists():
                break
            counter += 1

        try:
            shutil.copy2(src_path, dst_path)

            # 썸네일 복사
            src_thumb = backgrounds_dir / f"thumb_{stem}.jpg"
            dst_thumb = backgrounds_dir / f"thumb_{dst_path.stem}.jpg"
            dst_thumb_url = ""
            if src_thumb.exists():
                try:
                    shutil.copy2(src_thumb, dst_thumb)
                    dst_thumb_url = f"/static/backgrounds/thumb_{dst_path.stem}.jpg"
                except Exception as te:
                    logger.warning(f"Failed to copy thumb file: {te}")

            # 메타데이터 복사
            if name in meta:
                item_meta = dict(meta[name])
                if dst_thumb_url:
                    item_meta["thumbnailUrl"] = dst_thumb_url
                meta[new_name] = item_meta

            new_files.append(new_name)
        except Exception as e:
            logger.error(f"Failed to duplicate background file {name}: {e}")

    save_bg_meta(meta)
    return {"success": True, "new_files": new_files}
