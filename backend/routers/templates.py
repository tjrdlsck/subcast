import json
import urllib.parse
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Response

from backend.schemas import SlideTemplate
from backend.storage import load_global_templates, save_global_templates, save_project_data
from backend.services.connection_manager import manager

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("/export")
async def export_templates(ids: Optional[str] = Query(None)):
    try:
        all_templates = await load_global_templates()
        if ids:
            selected_ids = [i.strip() for i in ids.split(",") if i.strip()]
            templates = [t for t in all_templates if t.id in selected_ids]
        else:
            templates = all_templates

        if not templates:
            raise HTTPException(status_code=404, detail="내보낼 템플릿 데이터가 없습니다.")

        export_data = [t.model_dump() for t in templates]

        if len(templates) == 1:
            safe_name = "".join(c for c in templates[0].name if c.isalnum() or c in (' ', '_', '-')).strip()
            file_name = f"template_{safe_name}.json"
        else:
            file_name = "templates_export.json"

        encoded_filename = urllib.parse.quote(file_name)
        json_bytes = json.dumps(export_data, indent=2, ensure_ascii=False).encode('utf-8')
        return Response(
            content=json_bytes,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import")
async def import_templates(file: UploadFile = File(...)):
    try:
        content = await file.read()
        raw = json.loads(content.decode('utf-8'))
        if isinstance(raw, dict):
            raw = [raw]
        elif not isinstance(raw, list):
            raise HTTPException(status_code=400, detail="올바른 템플릿 데이터 형식(JSON 또는 JSON 배열)이 아닙니다.")

        existing_templates = await load_global_templates()
        existing_names = {t.name for t in existing_templates}
        existing_ids = {t.id for t in existing_templates}

        imported_count = 0
        for item in raw:
            try:
                tpl = SlideTemplate.model_validate(item)
            except Exception:
                continue

            orig_name = tpl.name.strip() if tpl.name else "이름 없는 템플릿"
            candidate_name = orig_name
            counter = 1
            while candidate_name in existing_names:
                candidate_name = f"{orig_name} ({counter})"
                counter += 1

            tpl.name = candidate_name
            existing_names.add(candidate_name)

            if tpl.id in existing_ids or not tpl.id:
                tpl.id = f"tpl_{uuid.uuid4().hex[:8]}"
            existing_ids.add(tpl.id)

            existing_templates.append(tpl)
            imported_count += 1

        await save_global_templates(existing_templates)
        if manager.project_data:
            manager.project_data.templates = existing_templates
            await save_project_data(manager.project_data)
            await manager.broadcast({
                "type": "INITIAL_SYNC",
                "data": manager.project_data.model_dump(),
                "lockedSlides": manager.locked_slides
            })
        return {"status": "success", "imported_count": imported_count}
    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="유효하지 않은 JSON 파일입니다.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
