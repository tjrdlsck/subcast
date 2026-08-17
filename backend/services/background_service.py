import json
import logging
import os
import subprocess
import time
from pathlib import Path

logger = logging.getLogger("subcast")

APP_DATA_DIR = os.environ.get("SUBCAST_DATA_DIR", ".")
backgrounds_dir = Path(APP_DATA_DIR) / "frontend" / "assets" / "backgrounds"
backgrounds_dir.mkdir(parents=True, exist_ok=True)
meta_file = backgrounds_dir / "meta.json"


def load_bg_meta() -> dict:
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_bg_meta(meta: dict):
    try:
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to save bg meta: {e}")


import shutil


def get_ffmpeg_executable() -> str | None:
    """시스템 PATH 또는 imageio_ffmpeg에서 ffmpeg 실행 파일 경로를 탐색합니다."""
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def generate_thumbnail_ffmpeg(video_path: Path, output_thumb_path: Path, timestamp_sec: float = 1.0) -> bool:
    try:
        ffmpeg_exe = get_ffmpeg_executable()
        if not ffmpeg_exe:
            logger.warning(f"ffmpeg 실행 파일을 찾을 수 없어 '{video_path.name}'의 썸네일 생성을 건너뜁니다.")
            return False

        cmd = [
            ffmpeg_exe,
            "-ss", str(timestamp_sec),
            "-i", str(video_path),
            "-vframes", "1",
            "-q:v", "2",
            "-y",
            str(output_thumb_path)
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        return res.returncode == 0 and output_thumb_path.exists()
    except Exception as e:
        logger.warning(f"Failed to generate thumbnail for {video_path.name}: {e}")
        return False


def cleanup_trash_backgrounds():
    """30일 이상 지난 .trash_ 임시 삭제 파일들을 영구 삭제합니다."""
    if not backgrounds_dir.exists():
        return
    now = time.time()
    cutoff = now - (30 * 86400)
    for p in backgrounds_dir.glob(".trash_*"):
        try:
            if p.is_file() and p.stat().st_mtime < cutoff:
                p.unlink()
                logger.info(f"Permanently deleted expired trash file: {p.name}")
        except Exception as e:
            logger.error(f"Failed to cleanup trash file {p.name}: {e}")
