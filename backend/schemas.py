from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ElementStyle(BaseModel):
    fontSize: Optional[str] = "4vw"
    fontColor: Optional[str] = "#ffffff"
    # 추가적인 스타일 속성을 유연하게 받기 위해 extra 속성을 허용하거나 dict 형태로 추가 정의 가능
    extra: Optional[Dict[str, Any]] = None

class Element(BaseModel):
    id: str
    type: str  # e.g., "text", "image"
    content: str
    x: float
    y: float
    width: float
    height: float
    style: ElementStyle = Field(default_factory=ElementStyle)

class Slide(BaseModel):
    id: str
    name: str
    elements: List[Element] = Field(default_factory=list)

class SystemSettings(BaseModel):
    targetWidth: int = 1920
    targetHeight: int = 1080
    currentLiveSlideId: Optional[str] = None

class ProjectData(BaseModel):
    settings: SystemSettings = Field(default_factory=SystemSettings)
    slides: List[Slide] = Field(default_factory=list)
