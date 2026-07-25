import json
import os
import re
import sqlite3

def parse_and_import_krv(js_path="GAE_Bible.js", db_path="GAE_Bible.db"):
    """
    GAE_Bible.js 파일에서 개역개정(KRV) 성경 데이터를 파싱하여
    sqlite3 GAE_Bible.db의 bible 테이블에 대량 삽입합니다.
    """
    if not os.path.exists(js_path):
        raise FileNotFoundError(f"원본 성경 JS 파일('{js_path}')을 찾을 수 없습니다.")

    print(f"[{js_path}] 파일 읽는 중...")
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    # JS 파일에서 const BIBLE_DATA = [...] 파싱
    match = re.search(r'const\s+BIBLE_DATA\s*=\s*(\[[\s\S]*\]);?', content)
    if not match:
        raise ValueError("GAE_Bible.js 내에서 BIBLE_DATA 배열 패턴을 찾을 수 없습니다.")

    json_str = match.group(1)
    data = json.loads(json_str)
    print(f"파싱 성공: 총 {len(data)}개 구절 추출됨.")

    # SQLite DB 연결
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 기존 bible 테이블 초기화 (DROP TABLE)
    print("기존 bible 테이블 삭제 및 재생성 중...")
    cursor.execute("DROP TABLE IF EXISTS bible")
    cursor.execute("""
        CREATE TABLE bible (
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

    # 인덱스 생성
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bible_version_book_chap ON bible(version_code, book_code, chapter)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bible_version_search ON bible(version_code, content)")

    # 개역개정 레코드 생성
    rows = []
    for item in data:
        rows.append((
            "KRV",
            item["book_code"],
            item["book_name"],
            item["chapter"],
            item["verse"],
            item["content"],
            item.get("title")
        ))

    print(f"DB 저장 중... (총 {len(rows)}개 구절)")
    cursor.executemany("""
        INSERT INTO bible (version_code, book_code, book_name, chapter, verse, content, title)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, rows)

    conn.commit()

    # 데이터 건수 검증
    cursor.execute("SELECT COUNT(*) FROM bible WHERE version_code = 'KRV'")
    cnt = cursor.fetchone()[0]
    print(f"✅ DB 임포트 완료! 저장된 개역개정 구절 수: {cnt}개")

    conn.close()
    return cnt

if __name__ == "__main__":
    parse_and_import_krv()
