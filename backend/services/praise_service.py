import os
import sqlite3
import unicodedata
from typing import List, Dict, Any, Optional

APP_DATA_DIR = os.environ.get("SUBCAST_DATA_DIR", ".")
DEFAULT_USER_DB_PATH = os.environ.get("SUBCAST_USER_DB_PATH", os.environ.get("SUBCAST_DB_PATH", os.path.join(APP_DATA_DIR, "subcast_user.db")))


class DuplicatePraiseTitleError(ValueError):
    """Raised when a save would reuse another song's title."""


class PraiseSongNotFoundError(LookupError):
    """Raised when an update cannot identify exactly one existing song."""


def normalize_song_title(title: str) -> str:
    """Normalize title whitespace and Unicode for duplicate comparisons."""
    return unicodedata.normalize("NFKC", title).strip().casefold()


class PraiseDatabaseHelper:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = DEFAULT_USER_DB_PATH
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
                CREATE TABLE IF NOT EXISTS praise_songs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    lyrics TEXT NOT NULL,
                    mood TEXT DEFAULT '기본/일반',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            try:
                cursor.execute("ALTER TABLE praise_songs ADD COLUMN mood TEXT DEFAULT '기본/일반'")
            except Exception:
                pass

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_praise_title ON praise_songs(title)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_praise_lyrics ON praise_songs(lyrics)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_praise_mood ON praise_songs(mood)")
            conn.commit()
        finally:
            conn.close()

    def search_songs(self, query_str: str, limit: int = 50) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.cursor()
        if not query_str.strip():
            sql = "SELECT id, title, lyrics, mood FROM praise_songs ORDER BY title ASC LIMIT ?"
            params = (limit,)
        else:
            sql = """
                SELECT id, title, lyrics, mood 
                FROM praise_songs 
                WHERE title LIKE ? OR lyrics LIKE ? OR mood LIKE ?
                ORDER BY title ASC
                LIMIT ?
            """
            param = f"%{query_str}%"
            params = (param, param, param, limit)
        try:
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def save_song(self, title: str, lyrics: str, song_id: Optional[int] = None, original_title: Optional[str] = None, mood: str = "기본/일반") -> int:
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("BEGIN IMMEDIATE")
            title = title.strip()
            target_id = song_id

            if song_id is not None:
                cursor.execute("SELECT id FROM praise_songs WHERE id = ?", (song_id,))
                if cursor.fetchone() is None:
                    raise PraiseSongNotFoundError("수정할 찬양곡을 찾을 수 없습니다. 목록을 새로고침해 주세요.")
            elif original_title is not None:
                old_key = normalize_song_title(original_title)
                cursor.execute("SELECT id, title FROM praise_songs")
                matches = [row["id"] for row in cursor.fetchall() if normalize_song_title(row["title"]) == old_key]
                if len(matches) != 1:
                    raise PraiseSongNotFoundError("수정할 찬양곡을 하나로 확인할 수 없습니다. 목록을 새로고침해 주세요.")
                target_id = matches[0]

            target_key = normalize_song_title(title)
            cursor.execute("SELECT id, title FROM praise_songs")
            for row in cursor.fetchall():
                if row["id"] != target_id and normalize_song_title(row["title"]) == target_key:
                    raise DuplicatePraiseTitleError("같은 제목의 찬양곡이 이미 등록되어 있습니다.")

            if target_id is not None:
                cursor.execute("""
                    UPDATE praise_songs
                    SET title = ?, lyrics = ?, mood = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (title, lyrics, mood, target_id))
            else:
                cursor.execute("""
                    INSERT INTO praise_songs (title, lyrics, mood)
                    VALUES (?, ?, ?)
                """, (title, lyrics, mood))
                target_id = cursor.lastrowid
            conn.commit()
            return int(target_id)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def delete_songs(self, song_ids: Optional[List[int]] = None, titles: Optional[List[str]] = None) -> int:
        conn = self.get_connection()
        cursor = conn.cursor()
        deleted_count = 0
        try:
            if song_ids:
                placeholders = ",".join(["?"] * len(song_ids))
                cursor.execute(f"DELETE FROM praise_songs WHERE id IN ({placeholders})", song_ids)
                deleted_count += cursor.rowcount
            if titles:
                placeholders = ",".join(["?"] * len(titles))
                cursor.execute(f"DELETE FROM praise_songs WHERE title IN ({placeholders})", titles)
                deleted_count += cursor.rowcount
            conn.commit()
            return deleted_count
        finally:
            conn.close()

    def get_all_songs(self) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT id, title, lyrics, mood FROM praise_songs ORDER BY title ASC")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def get_songs_by_ids(self, song_ids: List[int]) -> List[Dict[str, Any]]:
        if not song_ids:
            return []
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            placeholders = ",".join(["?"] * len(song_ids))
            cursor.execute(f"SELECT id, title, lyrics, mood FROM praise_songs WHERE id IN ({placeholders}) ORDER BY title ASC", song_ids)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def import_songs(self, songs: List[dict]) -> int:
        conn = self.get_connection()
        cursor = conn.cursor()
        count = 0
        try:
            cursor.execute("BEGIN IMMEDIATE")
            cursor.execute("SELECT title FROM praise_songs")
            existing_titles = {normalize_song_title(row["title"]) for row in cursor.fetchall()}

            for song in songs:
                orig_title = str(song.get("title", "")).strip()
                lyrics = str(song.get("lyrics", ""))
                if not orig_title or not lyrics.strip():
                    continue

                candidate_title = orig_title
                counter = 1
                while normalize_song_title(candidate_title) in existing_titles:
                    candidate_title = f"{orig_title} ({counter})"
                    counter += 1

                imported_mood = song.get("mood")
                imported_moods = song.get("moods")
                if not imported_mood and isinstance(imported_moods, list):
                    imported_mood = next((mood for mood in imported_moods if isinstance(mood, str) and mood.strip()), None)
                imported_mood = str(imported_mood or "기본/일반").strip() or "기본/일반"

                cursor.execute("""
                    INSERT INTO praise_songs (title, lyrics, mood)
                    VALUES (?, ?, ?)
                """, (candidate_title, lyrics, imported_mood))
                existing_titles.add(normalize_song_title(candidate_title))
                count += 1
            conn.commit()
            return count
        finally:
            conn.close()

praise_db = PraiseDatabaseHelper()
