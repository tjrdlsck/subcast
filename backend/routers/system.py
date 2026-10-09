import asyncio
import hashlib
import ipaddress
import logging
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request

from backend.services.connection_manager import manager
from backend.services.websocket_handler import _pending_save_tasks
from backend.storage import save_project_data
from backend.services.update_backup import create_update_backup
from backend.database import APP_DATA_DIR

logger = logging.getLogger("subcast")
router = APIRouter(prefix="/api/system", tags=["system"])


def _read_version() -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    for candidate in (
        os.path.join(base, "version.txt"),
        os.path.join(base, "..", "version.txt"),
        os.path.join(base, "..", "..", "version.txt"),
    ):
        try:
            value = Path(candidate).read_text(encoding="utf-8").strip()
            if value:
                return value
        except OSError:
            pass
    return "1.3.20"


CURRENT_VERSION = _read_version()
GITHUB_REPO = "tjrdlsck/subcast"
_UPDATE_LOCK = asyncio.Lock()
_UPDATE_IN_PROGRESS = False
_MAX_INSTALLER_BYTES = 1_000_000_000
_VERSION_RE = re.compile(r"^v?(\d+(?:\.\d+){1,3})$")


def _parse_ver(value: str) -> tuple[int, ...]:
    match = _VERSION_RE.fullmatch(str(value).strip())
    if not match:
        raise ValueError("Invalid release version")
    return tuple(int(part) for part in match.group(1).split("."))


def _trusted_github_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and parsed.hostname in {"github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"}


async def _latest_release() -> dict:
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        response = await client.get(url, headers={"User-Agent": "Subcast-AutoUpdater", "Accept": "application/vnd.github+json"})
        response.raise_for_status()
        data = response.json()
    version = data.get("tag_name", "")
    _parse_ver(version)
    if data.get("draft") or data.get("prerelease"):
        raise ValueError("Release is not a stable published version")
    return data


def _release_assets(data: dict) -> tuple[str, str, str]:
    version = data["tag_name"].lstrip("v")
    wanted = f"Subcast_Setup_v{version}.exe"
    checksum_name = f"{wanted}.sha256"
    assets = {a.get("name"): a.get("browser_download_url") for a in data.get("assets", [])}
    installer_url, checksum_url = assets.get(wanted), assets.get(checksum_name)
    if not installer_url or not checksum_url or not _trusted_github_url(installer_url) or not _trusted_github_url(checksum_url):
        raise ValueError("Release is missing a trusted installer or checksum")
    return version, installer_url, checksum_url


@router.get("/version")
async def get_system_version():
    return {"version": CURRENT_VERSION, "app": "Subcast"}


@router.get("/check-update")
async def check_update():
    try:
        data = await _latest_release()
        latest, installer_url, _ = _release_assets(data)
        has_update = _parse_ver(latest) > _parse_ver(CURRENT_VERSION)
        return {
            "has_update": has_update,
            "current_version": CURRENT_VERSION,
            "latest_version": latest,
            "latest_tag": data.get("tag_name"),
            "release_name": data.get("name", data.get("tag_name")),
            "release_notes": data.get("body", ""),
            "download_url": installer_url if has_update else None,
            "html_url": data.get("html_url", ""),
        }
    except Exception as exc:
        logger.warning("Update check failed: %s", exc)
        raise HTTPException(status_code=502, detail="최신 버전을 확인하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.") from exc


async def _download_verified_installer(installer_url: str, checksum_url: str) -> tuple[str, str]:
    temp_dir = tempfile.mkdtemp(prefix="subcast_update_")
    installer_path = os.path.join(temp_dir, "installer.exe")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=20.0), follow_redirects=True) as client:
            async with client.stream("GET", checksum_url, headers={"User-Agent": "Subcast-AutoUpdater"}) as response:
                response.raise_for_status()
                if not _trusted_github_url(str(response.url)):
                    raise ValueError("Untrusted checksum host")
                checksum_text = (await response.aread()).decode("ascii", errors="strict").strip()
            match = re.fullmatch(r"([0-9a-fA-F]{64})(?:\s+\*?.+)?", checksum_text)
            if not match:
                raise ValueError("Invalid installer checksum file")
            expected_hash = match.group(1).lower()
            digest = hashlib.sha256()
            total = 0
            async with client.stream("GET", installer_url, headers={"User-Agent": "Subcast-AutoUpdater"}) as response:
                response.raise_for_status()
                if not _trusted_github_url(str(response.url)):
                    raise ValueError("Untrusted installer host")
                length = response.headers.get("content-length")
                if length and int(length) > _MAX_INSTALLER_BYTES:
                    raise ValueError("Installer is too large")
                with open(installer_path, "xb") as output:
                    async for chunk in response.aiter_bytes(65536):
                        total += len(chunk)
                        if total > _MAX_INSTALLER_BYTES:
                            raise ValueError("Installer is too large")
                        digest.update(chunk)
                        output.write(chunk)
        with open(installer_path, "rb") as installer:
            if installer.read(2) != b"MZ" or total < 1024:
                raise ValueError("Downloaded file is not a valid Windows installer")
        if digest.hexdigest() != expected_hash:
            raise ValueError("Installer checksum mismatch")
        return installer_path, temp_dir
    except Exception:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def _launch_installer(installer_path: str) -> None:
    if os.name != "nt":
        raise OSError("Automatic installation is supported only on Windows")
    import ctypes
    result = ctypes.windll.shell32.ShellExecuteW(None, "open", installer_path,
        "/SILENT /NORESTARTAPPLICATIONS /SUBCASTUPDATE=1 /SUBCASTORIGINALUSER=1 /LOG", None, 1)
    if result <= 32:
        raise OSError(f"Windows could not start the installer (ShellExecute error {result})")


async def _flush_project_state() -> None:
    task = _pending_save_tasks.get("project")
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    if manager.project_data:
        await save_project_data(manager.project_data)


async def _exit_after_install_launch(installer_path: str) -> None:
    await manager.broadcast({"type": "RELOAD_APP", "delay_ms": 8000})
    await asyncio.sleep(2.0)
    os._exit(0)


def _schedule_temp_cleanup(temp_dir: str) -> None:
    if os.name != "nt":
        return
    env = os.environ.copy()
    env["SUBCAST_UPDATE_TEMP"] = temp_dir
    cleanup_script = (
        "$p=$env:SUBCAST_UPDATE_TEMP; "
        "for ($i=0; $i -lt 20 -and (Test-Path -LiteralPath $p); $i++) { "
        "Start-Sleep -Seconds 30; "
        "Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue }"
    )
    try:
        subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", cleanup_script],
            env=env,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        logger.warning("Could not start temporary update file cleanup for %s", temp_dir, exc_info=True)


@router.post("/auto-update")
async def perform_auto_update(request: Request):
    if request.query_params:
        raise HTTPException(status_code=400, detail="업데이트 주소는 요청 값으로 지정할 수 없습니다.")
    try:
        if not request.client or not ipaddress.ip_address(request.client.host).is_loopback:
            raise ValueError("non-loopback client")
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="업데이트는 프로그램을 실행 중인 컴퓨터에서만 시작할 수 있습니다.") from exc
    origin = request.headers.get("origin")
    if origin:
        parsed_origin = urlparse(origin)
        if parsed_origin.netloc.lower() != request.headers.get("host", "").lower() or parsed_origin.scheme != request.url.scheme:
            raise HTTPException(status_code=403, detail="허용되지 않은 업데이트 요청입니다.")
    global _UPDATE_IN_PROGRESS
    if _UPDATE_LOCK.locked() or _UPDATE_IN_PROGRESS:
        raise HTTPException(status_code=409, detail="업데이트가 이미 진행 중입니다.")
    async with _UPDATE_LOCK:
        temp_dir = None
        try:
            data = await _latest_release()
            version, installer_url, checksum_url = _release_assets(data)
            if _parse_ver(version) <= _parse_ver(CURRENT_VERSION):
                raise HTTPException(status_code=409, detail="설치할 새 버전이 없습니다.")
            installer_path, temp_dir = await _download_verified_installer(installer_url, checksum_url)
            await _flush_project_state()
            create_update_backup(APP_DATA_DIR)
            # Resolve UAC cancellation and process launch errors before reporting success.
            _launch_installer(installer_path)
            _UPDATE_IN_PROGRESS = True
            _schedule_temp_cleanup(temp_dir)
            asyncio.create_task(_exit_after_install_launch(installer_path))
            return {"status": "success", "version": version}
        except HTTPException:
            raise
        except Exception as exc:
            _UPDATE_IN_PROGRESS = False
            logger.exception("Auto update preparation failed")
            if temp_dir:
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail="업데이트 준비에 실패했습니다. 현재 프로그램과 데이터는 그대로 유지됩니다.") from exc
