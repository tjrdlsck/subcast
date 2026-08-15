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
    신규 subcast_user.db로 무손실 이관(Zero-Loss Migration)합니다.
    """
    user_db_path = os.path.join(appdata_dir, "subcast_user.db")
    
    # 이미 subcast_user.db가 존재하고 내용이 있다면 마이그레이션 불필요
    if os.path.exists(user_db_path) and os.path.getsize(user_db_path) > 0:
        return False

    os.makedirs(appdata_dir, exist_ok=True)

    # 레거시 DB 후보 경로 탐색 (AppData 우선, 설치 디렉터리 차순위)
    legacy_candidates = [
        os.path.join(appdata_dir, "GAE_Bible.db"),
    ]
    if install_dir:
        legacy_candidates.extend([
            os.path.join(install_dir, "GAE_Bible.db"),
            os.path.join(install_dir, "_internal", "GAE_Bible.db")
        ])

    legacy_db_path = None
    for cand in legacy_candidates:
        if os.path.exists(cand) and os.path.getsize(cand) > 0:
            legacy_db_path = cand
            break

    # 신규 사용자 DB 생성 및 테이블 초기화
    from backend.database import init_monitor_db
    from backend.services.praise_service import PraiseDatabaseHelper

    # 기본 테이블 스키마 생성
    init_monitor_db(user_db_path)
    praise_helper = PraiseDatabaseHelper(user_db_path)
    praise_helper.init_table()

    if not legacy_db_path:
        logger.info("새로운 환경입니다. 기본 subcast_user.db를 생성했습니다.")
        return True

    logger.info(f"레거시 DB 감지됨: {legacy_db_path}. subcast_user.db로 마이그레이션을 시작합니다.")

    try:
        legacy_conn = sqlite3.connect(legacy_db_path)
        legacy_conn.row_factory = sqlite3.Row
        user_conn = sqlite3.connect(user_db_path)

        # 1. praise_songs 테이블 이관
        tables = [r[0] for r in legacy_conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        
        if "praise_songs" in tables:
            # 컬럼 목록 확인
            praise_cols = [c[1] for c in legacy_conn.execute("PRAGMA table_info(praise_songs)").fetchall()]
            has_mood = "mood" in praise_cols
            has_updated_at = "updated_at" in praise_cols

            select_cols = ["id", "title", "lyrics"]
            if has_mood:
                select_cols.append("mood")
            if has_updated_at:
                select_cols.append("updated_at")

            query = f"SELECT {', '.join(select_cols)} FROM praise_songs"
            rows = legacy_conn.execute(query).fetchall()

            for r in rows:
                title = r["title"]
                lyrics = r["lyrics"]
                mood = r["mood"] if has_mood else "기본/일반"
                updated_at = r["updated_at"] if has_updated_at else None

                if updated_at:
                    user_conn.execute(
                        "INSERT OR IGNORE INTO praise_songs (id, title, lyrics, mood, updated_at) VALUES (?, ?, ?, ?, ?)",
                        (r["id"], title, lyrics, mood, updated_at)
                    )
                else:
                    user_conn.execute(
                        "INSERT OR IGNORE INTO praise_songs (id, title, lyrics, mood) VALUES (?, ?, ?, ?)",
                        (r["id"], title, lyrics, mood)
                    )
            logger.info(f"찬양곡 {len(rows)}건 이관 완료")

        # 2. monitor_settings 테이블 이관
        if "monitor_settings" in tables:
            monitor_cols = [c[1] for c in legacy_conn.execute("PRAGMA table_info(monitor_settings)").fetchall()]
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
            logger.info(f"모니터 설정 {len(rows)}건 이관 완료")

        user_conn.commit()
        user_conn.close()
        legacy_conn.close()

        # 레거시 DB 안전 백업 (AppData 내에 존재할 경우)
        appdata_legacy = os.path.join(appdata_dir, "GAE_Bible.db")
        if os.path.exists(appdata_legacy):
            backup_path = os.path.join(appdata_dir, "GAE_Bible.db.legacy_backup")
            if not os.path.exists(backup_path):
                shutil.copy2(appdata_legacy, backup_path)
                logger.info(f"레거시 DB 백업 완료: {backup_path}")

        logger.info("데이터 마이그레이션이 성공적으로 완료되었습니다.")
        return True

    except Exception as e:
        logger.error(f"마이그레이션 중 오류 발생: {e}", exc_info=True)
        return False
