from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List
from backend.schemas import ProjectCreateRequest, ProjectUpdateRequest
from backend.storage import (
    list_projects, create_project, update_project_name, delete_project,
    set_active_project_id, get_active_project_id, load_project_data,
    duplicate_projects_bulk, delete_projects_bulk, export_projects_bulk, import_projects_bulk
)

router = APIRouter(prefix="/api/projects", tags=["projects"])

@router.get("")
async def get_projects():
    try:
        return await list_projects()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
async def create_new_project(req: ProjectCreateRequest):
    try:
        if not req.name or not req.name.strip():
            raise HTTPException(status_code=400, detail="프로젝트 이름을 입력해주세요.")
        proj = await create_project(req.name.strip())
        return proj
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
