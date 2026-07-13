from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ElementStyle(BaseModel):
    fontSize: Optional[str] = "4vw"
    fontColor: Optional[str] = "#ffffff"
    fontFamily: Optional[str] = "Inter"
    fontWeight: Optional[str] = "normal"
    fontStyle: Optional[str] = "normal"
    textAlign: Optional[str] = "left"
    fillColor: Optional[str] = "#4f46e5"
    strokeColor: Optional[str] = "transparent"
    strokeWidth: Optional[int] = 0
    cornerRadius: Optional[int] = 0  # 모서리 둥글기 (rx, ry)
    opacity: Optional[float] = 1.0   # 불투명도 (0.0 ~ 1.0)
    extra: Optional[Dict[str, Any]] = None

class Element(BaseModel):
    id: str
    type: str  # e.g., "text", "rect", "circle", "triangle", "line", "group"
    content: str
    x: float
    y: float
    width: float
    height: float
    style: ElementStyle = Field(default_factory=ElementStyle)
    children: Optional[List['Element']] = None

# Self-referencing 모델 빌드
Element.model_rebuild()

class Slide(BaseModel):
    id: str
    name: str
    thumbnail: Optional[str] = None
    elements: List[Element] = Field(default_factory=list)

class SlideTemplate(BaseModel):
    id: str
    name: str
    thumbnail: Optional[str] = None
    elements: List[Element] = Field(default_factory=list)

class SystemSettings(BaseModel):
    targetWidth: int = 1920
    targetHeight: int = 1080
    currentLiveSlideId: Optional[str] = None

class ProjectData(BaseModel):
    settings: SystemSettings = Field(default_factory=SystemSettings)
    slides: List[Slide] = Field(default_factory=list)
    templates: List[SlideTemplate] = Field(default_factory=list)
