import os
import json
import aiofiles
from pathlib import Path
from backend.schemas import ProjectData, SystemSettings, Slide, Element, ElementStyle

# 데이터 저장 경로 설정
DATA_FILE_PATH = Path("data/project_data.json")

DEFAULT_PROJECT_DATA = ProjectData(
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

async def load_project_data() -> ProjectData:
    """프로젝트 데이터를 JSON 파일에서 로드합니다. 파일이 없으면 기본값을 생성하고 반환합니다."""
    if not DATA_FILE_PATH.exists():
        # 부모 디렉토리 생성
        DATA_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        await save_project_data(DEFAULT_PROJECT_DATA)
        return DEFAULT_PROJECT_DATA
    
    async with aiofiles.open(DATA_FILE_PATH, mode="r", encoding="utf-8") as f:
        content = await f.read()
        try:
            return ProjectData.model_validate_json(content)
        except Exception:
            # 파싱 에러 발생 시 백업 후 기본 데이터 반환
            return DEFAULT_PROJECT_DATA

async def save_project_data(data: ProjectData) -> None:
    """프로젝트 데이터를 JSON 파일에 저장합니다."""
    DATA_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(DATA_FILE_PATH, mode="w", encoding="utf-8") as f:
        # Pydantic v2 model_dump_json 사용
        await f.write(data.model_dump_json(indent=2))
