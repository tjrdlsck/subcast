import asyncio
import logging
import os
import subprocess
import sys
import tempfile
import zipfile
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
import httpx

from backend.services.connection_manager import manager

logger = logging.getLogger("subcast")
router = APIRouter(prefix="/api/system", tags=["system"])


def _read_version() -> str:
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    for candidate in [os.path.join(base, 'version.txt'), os.path.join(base, '..', 'version.txt')]:
        try:
            with open(candidate, 'r', encoding='utf-8') as f:
                v = f.read().strip()
                if v:
                    return v
        except Exception:
            pass
    return "1.3.16"


CURRENT_VERSION = _read_version()
GITHUB_REPO = "tjrdlsck/subcast"


def _parse_ver(v_str: str):
    try:
        clean = v_str.lstrip("v").strip()
        parts = [int(x) for x in clean.split(".") if x.isdigit()]
        return tuple(parts)
    except Exception:
        return (0, 0, 0)


async def _broadcast_update_and_exit(installer_path: str = None, flags: list = None, bat_path: str = None):
    """브라우저에 RELOAD_APP 신호를 먼저 보내고, 인스톨러/bat 실행 후 앱 종료"""
    try:
        await manager.broadcast({"type": "RELOAD_APP", "delay_ms": 8000})
    except Exception:
        pass
    await asyncio.sleep(1.5)
    if installer_path and flags:
        subprocess.Popen([installer_path] + flags, creationflags=subprocess.CREATE_NO_WINDOW)
    elif bat_path:
        subprocess.Popen(["cmd.exe", "/c", bat_path], creationflags=subprocess.CREATE_NEW_CONSOLE)
    await asyncio.sleep(0.5)
    os._exit(0)


@router.get("/version")
async def get_system_version():
    return {"version": CURRENT_VERSION, "app": "Subcast"}


@router.get("/check-update")
async def check_update():
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, headers={"User-Agent": "Subcast-AutoUpdater"})
            if res.status_code != 200:
                return {
                    "has_update": False,
                    "current_version": CURRENT_VERSION,
                    "latest_version": CURRENT_VERSION,
                    "message": "최신 버전 정보를 불러올 수 없습니다."
                }
            data = res.json()
            latest_tag = data.get("tag_name", "v0.0.0")
            latest_ver_str = latest_tag.lstrip("v")
            
            curr_ver_tuple = _parse_ver(CURRENT_VERSION)
            latest_ver_tuple = _parse_ver(latest_ver_str)
            
            has_update = latest_ver_tuple > curr_ver_tuple
            
            assets = data.get("assets", [])
            download_url = None
            for asset in assets:
                name = asset.get("name", "").lower()
                if name.endswith(".exe"):
                    download_url = asset.get("browser_download_url")
                    break
                elif name.endswith(".zip") and not download_url:
                    download_url = asset.get("browser_download_url")
            
            return {
                "has_update": has_update,
                "current_version": CURRENT_VERSION,
                "latest_version": latest_ver_str,
                "latest_tag": latest_tag,
                "release_name": data.get("name", latest_tag),
                "release_notes": data.get("body", ""),
                "download_url": download_url,
                "html_url": data.get("html_url", "")
            }
    except Exception as e:
        logger.error(f"Check update error: {e}")
        return {
            "has_update": False,
            "current_version": CURRENT_VERSION,
            "latest_version": CURRENT_VERSION,
            "error": str(e)
        }


@router.post("/auto-update")
async def perform_auto_update(download_url: Optional[str] = Query(None)):
    try:
        if not download_url:
            check_res = await check_update()
            if not check_res.get("has_update") and not check_res.get("download_url"):
                raise HTTPException(status_code=400, detail="업데이트 가능한 새 버전이 없습니다.")
            download_url = check_res.get("download_url")
            
        if not download_url:
            raise HTTPException(status_code=400, detail="다운로드 가능한 업데이트 파일이 없습니다.")
            
        temp_dir = tempfile.mkdtemp(prefix="subcast_update_")
        
        is_exe = download_url.lower().endswith(".exe")
        file_name = "update.exe" if is_exe else "update.zip"
        download_path = os.path.join(temp_dir, file_name)
        
        async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
            async with client.stream("GET", download_url, headers={"User-Agent": "Subcast-AutoUpdater"}) as res:
                if res.status_code != 200:
                    raise HTTPException(status_code=500, detail="업데이트 파일 다운로드 실패")
                with open(download_path, "wb") as f:
                    async for chunk in res.aiter_bytes(chunk_size=65536):
                        f.write(chunk)

        if is_exe:
            asyncio.create_task(_broadcast_update_and_exit(
                installer_path=download_path,
                flags=['/VERYSILENT', '/SUPPRESSMSGBOXES', '/FORCECLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS', '/NOCANCEL']
            ))
            return {"status": "success", "message": "업데이트 다운로드 완료. 잠시 후 앱이 재시작됩니다."}
        else:
            extract_dir = os.path.join(temp_dir, "extracted")
            with zipfile.ZipFile(download_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
                
            if getattr(sys, 'frozen', False):
                app_dir = os.path.dirname(sys.executable)
            else:
                app_dir = os.getcwd()
            curr_pid = os.getpid()
            
            target_exe = os.path.join(app_dir, "subcast.exe")
            if not os.path.exists(target_exe):
                target_exe = f'"{sys.executable}" backend/main.py'
            else:
                target_exe = f'"{target_exe}"'
                
            bat_path = os.path.join(temp_dir, "apply_update.bat")
            bat_content = f"""@echo off\nchcp 65001 > nul\necho [Subcast Auto-Updater] 기존 프로세스 종료 중... (PID: {curr_pid})\ntaskkill /F /PID {curr_pid} > nul 2>&1\ntaskkill /F /IM subcast.exe > nul 2>&1\ntimeout /t 3 /nobreak > nul\n\necho [Subcast Auto-Updater] 최신 버전 패치 적용 중...\nxcopy /s /e /y /q "{extract_dir}\\*" "{app_dir}\\" > nul\n\necho [Subcast Auto-Updater] 패치 완료. 애플리케이션 재시작 중...\ntimeout /t 1 /nobreak > nul\nstart "" {target_exe}\n\ndel "%~f0"\n"""
            with open(bat_path, "w", encoding="utf-8") as f:
                f.write(bat_content)
            
            asyncio.create_task(_broadcast_update_and_exit(
                bat_path=bat_path
            ))
            return {"status": "success", "message": "업데이트 패치 완료. 잠시 후 앱이 재시작됩니다."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auto update error: {e}")
        raise HTTPException(status_code=500, detail=f"자동 업데이트 실패: {str(e)}")
