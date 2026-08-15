import os
import sys
import sqlite3
from typing import List, Dict, Any

APP_DATA_DIR = os.environ.get("SUBCAST_DATA_DIR", ".")


def resolve_bible_db_path() -> str:
    """정적 성경 DB(bible.db) 경로를 탐색하며, 없을 경우 구버전 GAE_Bible.db를 Fallback으로 조회합니다."""
    custom_path = os.environ.get("SUBCAST_BIBLE_DB_PATH")
    if custom_path and os.path.exists(custom_path):
        return custom_path

    candidates = [
        "bible.db",
        os.path.join(APP_DATA_DIR, "bible.db"),
    ]

    # PyInstaller 번들 경로 탐색
    if getattr(sys, 'frozen', False):
        base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
        candidates.insert(0, os.path.join(base_dir, "bible.db"))
        candidates.append(os.path.join(base_dir, "GAE_Bible.db"))

    # 레거시 DB Fallback 탐색
    candidates.extend([
        "GAE_Bible.db",
        os.path.join(APP_DATA_DIR, "GAE_Bible.db"),
    ])

    for p in candidates:
        if os.path.exists(p) and os.path.getsize(p) > 0:
            return p

    return "bible.db"


class BibleDatabaseHelper:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = resolve_bible_db_path()
        self.db_path = db_path
        self.init_table()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_table(self):
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS bible (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    version_code TEXT NOT NULL DEFAULT 'KRV',
                    book_code TEXT NOT NULL,
                    book_name TEXT NOT NULL,
                    chapter INTEGER NOT NULL,
                    verse INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    title TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_bible_version_book_chap ON bible(version_code, book_code, chapter)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_bible_version_search ON bible(version_code, content)")
            
            # 테이블 데이터 존재 여부 확인 및 자동 파싱 연동
            cursor.execute("SELECT COUNT(*) as cnt FROM bible")
            cnt = cursor.fetchone()["cnt"]
            if cnt == 0:
                try:
                    from parse_bible import parse_and_import_krv
                    parse_and_import_krv(db_path=self.db_path)
                except Exception as e:
                    print(f"자동 성경 파싱 실패: {e}")
            conn.commit()
        finally:
            conn.close()

    def get_books(self, version_code: str = "KRV") -> List[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.cursor()
        query = """
            SELECT DISTINCT book_name, book_code
            FROM bible 
            WHERE version_code = ?
            ORDER BY id ASC
        """
        try:
            cursor.execute(query, (version_code,))
            rows = cursor.fetchall()
            books_map = {}
            for row in rows:
                books_map[row["book_code"]] = {
                    "book_code": row["book_code"],
                    "book_name": row["book_name"],
                    "max_chapter": 0
                }
            
            cursor.execute("SELECT book_code, MAX(chapter) as max_c FROM bible WHERE version_code = ? GROUP BY book_code", (version_code,))
            for row in cursor.fetchall():
                if row["book_code"] in books_map:
                    books_map[row["book_code"]]["max_chapter"] = row["max_c"]
            
            return list(books_map.values())
        finally:
            conn.close()

    def get_chapter(self, book_code: str, chapter: int, start_verse: int = 1, end_verse: int = 999, version_code: str = "KRV") -> List[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.cursor()
        query = """
            SELECT verse, content, title, book_name
            FROM bible 
            WHERE version_code = ? AND UPPER(book_code) = UPPER(?) AND chapter = ? AND verse >= ? AND verse <= ?
            ORDER BY verse ASC, id ASC
        """
        try:
            cursor.execute(query, (version_code, book_code, chapter, start_verse, end_verse))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def search_keyword(self, keyword: str, limit: int = 50, version_code: str = "KRV") -> List[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.cursor()
        query = """
            SELECT book_name, book_code, chapter, verse, content 
            FROM bible 
            WHERE version_code = ? AND content LIKE ?
            ORDER BY id ASC
            LIMIT ?
        """
        try:
            search_param = f"%{keyword}%"
            cursor.execute(query, (version_code, search_param, limit))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

db_helper = BibleDatabaseHelper()
