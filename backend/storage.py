import os
import json
import uuid
import aiofiles
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from backend.schemas import ProjectData, SystemSettings, Slide, SlideTemplate, Element, ElementStyle, ProjectListItem

# 데이터 저장 경로 설정
DATA_DIR = Path("data")
PROJECTS_DIR = DATA_DIR / "projects"
ACTIVE_PROJECT_FILE = DATA_DIR / "active_project_id.txt"
OLD_DATA_FILE_PATH = DATA_DIR / "project_data.json"
TEMPLATES_FILE_PATH = DATA_DIR / "templates.json"

async def load_global_templates() -> List[SlideTemplate]:
    """전역 템플릿 목록을 로드합니다. 파일이 없으면 기존 프로젝트 파일들의 templates를 이관(Merge)합니다."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    
    if not TEMPLATES_FILE_PATH.exists():
        templates_map = {}
        project_files = list(PROJECTS_DIR.glob("*.json"))
        for pfile in project_files:
            try:
                async with aiofiles.open(pfile, mode="r", encoding="utf-8") as f:
                    content = await f.read()
                    raw = json.loads(content)
                    tpls_raw = raw.get("templates", [])
                    for t_data in tpls_raw:
                        try:
                            tpl = SlideTemplate.model_validate(t_data)
                            templates_map[tpl.id] = tpl
                        except Exception:
                            pass
            except Exception:
                pass
        
        merged_templates = list(templates_map.values())
        await save_global_templates(merged_templates)
        return merged_templates

    async with aiofiles.open(TEMPLATES_FILE_PATH, mode="r", encoding="utf-8") as f:
        content = await f.read()
        try:
            raw_list = json.loads(content)
            return [SlideTemplate.model_validate(t) for t in raw_list]
        except Exception:
            return []

async def save_global_templates(templates: List[SlideTemplate]) -> None:
    """전역 템플릿 목록을 templates.json 파일에 저장합니다."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = TEMPLATES_FILE_PATH.with_suffix('.json.tmp')
    try:
        raw_list = [t.model_dump() for t in templates]
        async with aiofiles.open(temp_path, mode="w", encoding="utf-8") as f:
            await f.write(json.dumps(raw_list, indent=2, ensure_ascii=False))
        os.replace(temp_path, TEMPLATES_FILE_PATH)
    except Exception as e:
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise e

DEFAULT_PROJECT_DATA = ProjectData(
    id="proj_default",
    name="기본 프로젝트",
    createdAt=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    updatedAt=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    settings=SystemSettings(
        targetWidth=1920,
        targetHeight=1080,
        currentLiveSlideId="slide_1"
    ),
    slides=[
        Slide(
            id="slide_1",
            name="오프닝 타이틀",
            elements=[
                Element(
                    id="elem_1",
                    type="text",
                    content="생방송 시작 5분 전",
                    x=20.0,
                    y=45.0,
                    width=60.0,
                    height=10.0,
                    style=ElementStyle(fontSize="4vw", fontColor="#ffffff")
                )
            ]
        ),
        Slide(
            id="slide_2",
            name="본방송 하단 자막",
            elements=[
                Element(
                    id="elem_2",
                    type="text",
                    content="홍길동 의원 / 현직 국회의원 인터뷰",
                    x=10.0,
                    y=80.0,
                    width=80.0,
                    height=12.0,
                    style=ElementStyle(fontSize="3vw", fontColor="#ffeb3b")
                )
            ]
        )
    ]
)

def get_active_project_id() -> str:
    """현재 활성화된 프로젝트 ID를 반환합니다."""
    if ACTIVE_PROJECT_FILE.exists():
        try:
            pid = ACTIVE_PROJECT_FILE.read_text(encoding="utf-8").strip()
            if pid:
                return pid
        except Exception:
            pass
    return "proj_default"

def set_active_project_id(project_id: str) -> None:
    """현재 활성화된 프로젝트 ID를 설정합니다."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVE_PROJECT_FILE.write_text(project_id, encoding="utf-8")

async def load_project_data(project_id: Optional[str] = None) -> ProjectData:
    """지정된 또는 현재 활성화된 프로젝트 데이터를 로드합니다."""
    if not project_id:
        project_id = get_active_project_id()

    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    target_path = PROJECTS_DIR / f"{project_id}.json"

    if not target_path.exists():
        # 기존 단일 project_data.json 이관 처리
        if OLD_DATA_FILE_PATH.exists() and project_id == "proj_default":
            try:
                async with aiofiles.open(OLD_DATA_FILE_PATH, mode="r", encoding="utf-8") as f:
                    content = await f.read()
                    data = ProjectData.model_validate_json(content)
                    data.id = project_id
                    data.name = "기본 프로젝트"
                    await save_project_data(data)
                    return data
            except Exception:
                pass

        # 파일이 없으면 기본 데이터 생성 및 저장
        new_data = DEFAULT_PROJECT_DATA.model_copy(deep=True)
        new_data.id = project_id
        if project_id != "proj_default":
            new_data.name = f"프로젝트_{project_id[:6]}"
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_data.createdAt = now_str
        new_data.updatedAt = now_str
        await save_project_data(new_data)
        return new_data

    async with aiofiles.open(target_path, mode="r", encoding="utf-8") as f:
        content = await f.read()
        try:
            data = ProjectData.model_validate_json(content)
            if not data.id:
                data.id = project_id
            data.templates = await load_global_templates()
            return data
        except Exception:
            data = DEFAULT_PROJECT_DATA.model_copy(deep=True)
            data.templates = await load_global_templates()
            return data

async def save_project_data(data: ProjectData, project_id: Optional[str] = None) -> None:
    """프로젝트 데이터를 JSON 파일에 저장합니다."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    pid = project_id or data.id or "proj_default"
    data.id = pid
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data.updatedAt = now_str
    if not data.createdAt:
        data.createdAt = now_str

    target_path = PROJECTS_DIR / f"{pid}.json"
    temp_path = target_path.with_suffix('.json.tmp')
    try:
        async with aiofiles.open(temp_path, mode="w", encoding="utf-8") as f:
            await f.write(data.model_dump_json(indent=2))
        os.replace(temp_path, target_path)
    except Exception as e:
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise e

async def list_projects() -> List[ProjectListItem]:
    """저장된 모든 프로젝트 목록을 반환합니다."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    active_id = get_active_project_id()
    project_files = list(PROJECTS_DIR.glob("*.json"))

    if not project_files:
        # 프로젝트가 하나도 없는 경우 기본 프로젝트 로드/생성
        await load_project_data("proj_default")
        project_files = list(PROJECTS_DIR.glob("*.json"))

    items = []
    for pfile in project_files:
        pid = pfile.stem
        try:
            async with aiofiles.open(pfile, mode="r", encoding="utf-8") as f:
                content = await f.read()
                raw = json.loads(content)
                name = raw.get("name", pid)
                created_at = raw.get("createdAt", "")
                updated_at = raw.get("updatedAt", "")
                slide_count = len(raw.get("slides", []))
                items.append(ProjectListItem(
                    id=pid,
                    name=name,
                    createdAt=created_at,
                    updatedAt=updated_at,
                    slideCount=slide_count,
                    isActive=(pid == active_id)
                ))
        except Exception:
            items.append(ProjectListItem(
                id=pid,
                name=pid,
                slideCount=0,
                isActive=(pid == active_id)
            ))

    # updatedAt 기준 내림차순 정렬
    items.sort(key=lambda x: x.updatedAt or "", reverse=True)
    return items

async def create_project(name: str) -> ProjectData:
    """새로운 프로젝트를 생성합니다. (빈 슬라이드 1개 포함)"""
    target_name = name.strip() if name and name.strip() else "새 프로젝트"
    
    existing = await list_projects()
    if any(p.name == target_name for p in existing):
        raise ValueError("이미 존재하는 프로젝트 이름입니다.")

    new_id = f"proj_{uuid.uuid4().hex[:8]}"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    initial_slide_id = f"slide_{uuid.uuid4().hex[:8]}"
    initial_slide = Slide(id=initial_slide_id, name="새 슬라이드 1", elements=[])
    
    new_data = ProjectData(
        id=new_id,
        name=target_name,
        createdAt=now_str,
        updatedAt=now_str,
        settings=SystemSettings(
            targetWidth=1920,
            targetHeight=1080,
            currentLiveSlideId=initial_slide_id
        ),
        slides=[initial_slide],
        templates=await load_global_templates(),
        customFonts=[]
    )
    
    await save_project_data(new_data)
    return new_data

async def update_project_name(project_id: str, new_name: str) -> ProjectData:
    """프로젝트 이름을 수정합니다."""
    target_name = new_name.strip()
    if not target_name:
        raise ValueError("프로젝트 이름을 입력해주세요.")
    
    existing = await list_projects()
    if any(p.name == target_name and p.id != project_id for p in existing):
        raise ValueError("이미 존재하는 프로젝트 이름입니다.")
    
    project = await load_project_data(project_id)
    project.name = target_name
    await save_project_data(project)
    return project

async def delete_project(project_id: str) -> str:
    """프로젝트를 삭제합니다. 만약 활성화된 프로젝트였다면 새로운 활성 프로젝트 ID를 반환합니다."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    target_path = PROJECTS_DIR / f"{project_id}.json"
    if target_path.exists():
        try:
            target_path.unlink()
        except Exception as e:
            raise e

    active_id = get_active_project_id()
    if active_id == project_id:
        remaining = list(PROJECTS_DIR.glob("*.json"))
        if remaining:
            new_active_id = remaining[0].stem
        else:
            new_active_id = "proj_default"
            await load_project_data(new_active_id)
        set_active_project_id(new_active_id)
        return new_active_id
    
    return active_id

async def duplicate_projects_bulk(project_ids: List[str]) -> List[ProjectData]:
    """선택한 프로젝트들을 복제하여 새로운 프로젝트로 생성합니다."""
    duplicated = []
    existing = await list_projects()
    existing_names = {p.name for p in existing}

    for pid in project_ids:
        orig = await load_project_data(pid)
        new_id = f"proj_{uuid.uuid4().hex[:8]}"
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        candidate_name = f"{orig.name} (복사본)"
        counter = 2
        while candidate_name in existing_names:
            candidate_name = f"{orig.name} (복사본 {counter})"
            counter += 1
        
        new_data = orig.model_copy(deep=True)
        new_data.id = new_id
        new_data.name = candidate_name
        new_data.createdAt = now_str
        new_data.updatedAt = now_str
        
        await save_project_data(new_data)
        existing_names.add(candidate_name)
        duplicated.append(new_data)
    return duplicated

async def delete_projects_bulk(project_ids: List[str]) -> str:
    """여러 프로젝트를 일괄 삭제합니다."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    active_id = get_active_project_id()
    active_deleted = False

    for pid in project_ids:
        target_path = PROJECTS_DIR / f"{pid}.json"
        if target_path.exists():
            try:
                target_path.unlink()
            except Exception:
                pass
        if pid == active_id:
            active_deleted = True

    remaining = list(PROJECTS_DIR.glob("*.json"))
    if not remaining:
        new_active_id = "proj_default"
        await load_project_data(new_active_id)
        set_active_project_id(new_active_id)
        return new_active_id

    if active_deleted:
        new_active_id = remaining[0].stem
        set_active_project_id(new_active_id)
        return new_active_id

    return active_id

async def import_project_data(raw_data: dict) -> ProjectData:
    """가져온 JSON 데이터를 이용하여 새로운 프로젝트로 등록합니다."""
    project = ProjectData.model_validate(raw_data)
    
    existing = await list_projects()
    existing_names = {p.name for p in existing}
    
    orig_name = project.name.strip() if project.name and project.name.strip() else "가져온 프로젝트"
    candidate_name = orig_name
    counter = 1
    while candidate_name in existing_names:
        counter += 1
        candidate_name = f"{orig_name} (가져옴 {counter})"
    
    new_id = f"proj_{uuid.uuid4().hex[:8]}"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    project.id = new_id
    project.name = candidate_name
    project.createdAt = now_str
    project.updatedAt = now_str
    
    await save_project_data(project)
    return project

