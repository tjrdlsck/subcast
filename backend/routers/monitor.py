from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from backend.monitor_repository import get_monitor_settings, update_monitor_settings

router = APIRouter(prefix="/api/v1/monitor", tags=["monitor"])

class MonitorBoxSchema(BaseModel):
    leftPct: Optional[float] = 5.0
    topPct: Optional[float] = 5.0
    widthPct: Optional[float] = 90.0
    heightPct: Optional[float] = 42.0
    fontSize: Optional[int] = 28
    textColor: Optional[str] = "#FFFFFF"
    strokeColor: Optional[str] = "transparent"
    strokeWidth: Optional[int] = 0
    bgColor: Optional[str] = "transparent"
    isTransparentBg: Optional[bool] = True
    fontWeight: Optional[str] = "bold"
    fontStyle: Optional[str] = "normal"
    fontFamily: Optional[str] = "Inter"
    textAlign: Optional[str] = "center"
    opacity: Optional[float] = 1.0
    lineHeight: Optional[float] = 1.35

from typing import Dict, Any, Optional, List

class MonitorSettingsPayload(BaseModel):
    layoutMode: Optional[str] = "custom_canvas"
    currentBox: Optional[MonitorBoxSchema] = Field(default_factory=MonitorBoxSchema)
    nextBox: Optional[MonitorBoxSchema] = Field(default_factory=MonitorBoxSchema)
    customElements: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

@router.get("/settings")
async def get_settings():
    try:
        settings = get_monitor_settings()
        if not settings:
            return JSONResponse(status_code=404, content={"status": "error", "message": "Settings not found"})
        return {
            "status": "success",
            "data": settings
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@router.put("/settings")
async def update_settings(payload: Dict[str, Any]):
    try:
        updated = update_monitor_settings(payload)
        return {
            "status": "success",
            "message": "Monitor settings updated successfully",
            "updatedAt": updated.get("updatedAt")
        }
    except ValueError as ve:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "errorCode": "INVALID_BOUNDS",
                "message": str(ve)
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(e)
            }
        )
