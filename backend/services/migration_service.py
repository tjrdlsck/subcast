import os
import sqlite3
import shutil
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("subcast.migration")


def migrate_legacy_db_if_needed(appdata_dir: str, install_dir: Optional[str] = None) -> bool:
    """
    구버전 GAE_Bible.db에 저장된 사용자 데이터(praise_songs, monitor_settings)를
    신규 subcast_user.db로 무손실 이관 및 병합(Zero-Loss Migration & Merge)합니다.
    """
    user_db_path = os.path.join(appdata_dir, "subcast_user.db")
    os.makedirs(appdata_dir, exist_ok=True)

    # 신규 사용자 DB 생성 및 테이블 초기화
    from backend.database import init_monitor_db
    from backend.services.praise_service import PraiseDatabaseHelper

    init_monitor_db(user_db_path)
    praise_helper = PraiseDatabaseHelper(user_db_path)
    praise_helper.init_table()

    # 레거시 DB 후보 경로 탐색 (AppData, 설치 디렉터리 우선 탐색)
    legacy_candidates = [
        os.path.join(appdata_dir, "GAE_Bible.db"),
        os.path.join(appdata_dir, "GAE_Bible.db.legacy_backup"),
    ]
    if install_dir:
        legacy_candidates.extend([
            os.path.join(install_dir, "GAE_Bible.db"),
            os.path.join(install_dir, "_internal", "GAE_Bible.db")
        ])

    legacy_db_paths = []
    for cand in legacy_candidates:
        if os.path.exists(cand) and os.path.getsize(cand) > 0 and cand != user_db_path:
            legacy_db_paths.append(cand)

    # 상위 경로에서 찾지 못한 경우 현재 작업 디렉터리 검사
    if not legacy_db_paths:
        cwd_legacy = os.path.join(os.getcwd(), "GAE_Bible.db")
        if os.path.exists(cwd_legacy) and os.path.getsize(cwd_legacy) > 0 and cwd_legacy != user_db_path:
            legacy_db_paths.append(cwd_legacy)

    if not legacy_db_paths:
        logger.info("레거시 DB가 발견되지 않았습니다. 기본 subcast_user.db를 유지합니다.")
        return True

    try:
        user_conn = sqlite3.connect(user_db_path)
        user_conn.row_factory = sqlite3.Row

        for legacy_db_path in legacy_db_paths:
            logger.info(f"레거시 DB 병합 시도: {legacy_db_path}")
            legacy_conn = sqlite3.connect(legacy_db_path)
            legacy_conn.row_factory = sqlite3.Row

            try:
                tables = [r[0] for r in legacy_conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
                
                # 1. praise_songs 테이블 이관 및 병합
                if "praise_songs" in tables:
                    praise_cols = [c[1] for c in legacy_conn.execute("PRAGMA table_info(praise_songs)").fetchall()]
                    has_mood = "mood" in praise_cols
                    has_updated_at = "updated_at" in praise_cols

                    select_cols = ["title", "lyrics"]
                    if has_mood:
                        select_cols.append("mood")
                    if has_updated_at:
                        select_cols.append("updated_at")

                    query = f"SELECT {', '.join(select_cols)} FROM praise_songs"
                    rows = legacy_conn.execute(query).fetchall()

                    # 기존 user_conn에 등록된 (title, lyrics) 집합 조회
                    existing_songs = {
                        (r["title"].strip(), r["lyrics"].strip())
                        for r in user_conn.execute("SELECT title, lyrics FROM praise_songs").fetchall()
                    }

                    migrated_count = 0
                    for r in rows:
                        title = r["title"]
                        lyrics = r["lyrics"]
                        if (title.strip(), lyrics.strip()) in existing_songs:
                            continue

                        mood = r["mood"] if has_mood else "기본/일반"
                        updated_at = r["updated_at"] if has_updated_at else None

                        if updated_at:
                            user_conn.execute(
                                "INSERT INTO praise_songs (title, lyrics, mood, updated_at) VALUES (?, ?, ?, ?)",
                                (title, lyrics, mood, updated_at)
                            )
                        else:
                            user_conn.execute(
                                "INSERT INTO praise_songs (title, lyrics, mood) VALUES (?, ?, ?)",
                                (title, lyrics, mood)
                            )
                        existing_songs.add((title.strip(), lyrics.strip()))
                        migrated_count += 1

                    if migrated_count > 0:
                        logger.info(f"{legacy_db_path}에서 찬양곡 {migrated_count}건 병합 완료")

                # 2. monitor_settings 테이블 이관
                if "monitor_settings" in tables:
                    query = "SELECT * FROM monitor_settings"
                    rows = legacy_conn.execute(query).fetchall()

                    for r in rows:
                        col_names = [k for k in r.keys()]
                        placeholders = ", ".join(["?"] * len(col_names))
                        cols_str = ", ".join(col_names)
                        values = [r[k] for k in col_names]
                        user_conn.execute(
                            f"INSERT OR REPLACE INTO monitor_settings ({cols_str}) VALUES ({placeholders})",
                            values
                        )
                    logger.info(f"{legacy_db_path}에서 모니터 설정 이관/확인 완료")

                user_conn.commit()
            finally:
                legacy_conn.close()

        user_conn.close()

        # 레거시 DB 안전 백업 (AppData 내에 존재할 경우)
        appdata_legacy = os.path.join(appdata_dir, "GAE_Bible.db")
        if os.path.exists(appdata_legacy):
            backup_path = os.path.join(appdata_dir, "GAE_Bible.db.legacy_backup")
            if not os.path.exists(backup_path):
                shutil.copy2(appdata_legacy, backup_path)
                logger.info(f"레거시 DB 백업 완료: {backup_path}")

        logger.info("데이터 마이그레이션 및 동기화가 성공적으로 완료되었습니다.")
        return True

    except Exception as e:
        logger.error(f"마이그레이션 중 오류 발생: {e}", exc_info=True)
        return False
