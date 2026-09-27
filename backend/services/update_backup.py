"""Create a verified snapshot of user data before replacing the application."""

import json
import os
import sqlite3
import tempfile
import uuid
import zipfile
from contextlib import closing
from datetime import datetime
from pathlib import Path


def create_update_backup(appdata_dir: str) -> Path:
    source = Path(appdata_dir).resolve()
    backup_dir = source.parent / "SubcastBackups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    destination = backup_dir / f"Subcast_{datetime.now():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:8]}.zip"
    temporary = destination.with_suffix(".zip.tmp")

    try:
        with tempfile.TemporaryDirectory(prefix="subcast_db_backup_") as scratch:
            db_copies: dict[Path, Path] = {}
            for path in source.rglob("*.db"):
                if path.is_symlink():
                    continue
                target = Path(scratch) / f"{len(db_copies)}.db"
                with closing(sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)) as original:
                    with closing(sqlite3.connect(target)) as snapshot:
                        original.backup(snapshot)
                db_copies[path] = target

            files = [
                p for p in source.rglob("*")
                if p.is_file() and not p.is_symlink()
                and not p.name.endswith((".db-journal", ".db-wal", ".db-shm"))
            ]
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                for path in files:
                    archive.write(db_copies.get(path, path), arcname=path.relative_to(source).as_posix())
                archive.writestr("_backup_info.json", json.dumps({"source": str(source), "created_at": datetime.now().isoformat()}))
            with zipfile.ZipFile(temporary) as archive:
                if archive.testzip() is not None:
                    raise OSError("Update backup verification failed")
            os.replace(temporary, destination)
        return destination
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
