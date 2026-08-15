import json
import os
import re
import sqlite3

def parse_and_import_krv(js_path="GAE_Bible.js", db_path="bible.db"):
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
    print(f"✅ 개역개정 (KRV) DB 임포트 완료! 저장된 구절 수: {cnt}개")

    conn.close()
    return cnt

def parse_and_import_easy(html_path="viewer_easy.html", db_path="bible.db"):
    """
    viewer_easy.html 파일에서 쉬운성경(EASY) 데이터를 파싱하여
    sqlite3 GAE_Bible.db의 bible 테이블에 추가/업데이트합니다.
    """
    if not os.path.exists(html_path):
        raise FileNotFoundError(f"원본 성경 HTML 파일('{html_path}')을 찾을 수 없습니다.")

    print(f"[{html_path}] 파일 읽는 중...")
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. books 메타데이터 파싱 (code -> name 매핑)
    m_b = re.search(r'const\s+books\s*=\s*(\[[\s\S]*?\]);', content)
    if not m_b:
        raise ValueError("viewer_easy.html 내에서 const books 배열을 찾을 수 없습니다.")
    books_meta = json.loads(m_b.group(1))
    book_name_map = {item["code"].lower(): item["name"] for item in books_meta}

    # 2. bibleData 파싱
    m_d = re.search(r'const\s+bibleData\s*=\s*(\[[\s\S]*?\]);', content)
    if not m_d:
        raise ValueError("viewer_easy.html 내에서 const bibleData 배열을 찾을 수 없습니다.")
    data = json.loads(m_d.group(1))
    print(f"쉬운성경 파싱 성공: 총 {len(data)}개 구절 추출됨.")

    # DB 연결
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 기존 EASY 데이터 삭제 후 인서트
    cursor.execute("DELETE FROM bible WHERE version_code = 'EASY'")

    rows = []
    for item in data:
        code = item["b"].lower()
        name = book_name_map.get(code, code)
        rows.append((
            "EASY",
            code,
            name,
            item["c"],
            item["v"],
            item["txt"],
            item.get("t")
        ))

    print(f"DB 저장 중... (EASY 총 {len(rows)}개 구절)")
    cursor.executemany("""
        INSERT INTO bible (version_code, book_code, book_name, chapter, verse, content, title)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, rows)

    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM bible WHERE version_code = 'EASY'")
    cnt = cursor.fetchone()[0]
    print(f"✅ 쉬운성경 (EASY) DB 임포트 완료! 저장된 구절 수: {cnt}개")

    conn.close()
    return cnt

def parse_and_import_niv(html_path="viewer_niv.html", db_path="bible.db"):
    """
    viewer_niv.html 파일에서 NIV 영어성경 데이터를 파싱하여
    sqlite3 GAE_Bible.db의 bible 테이블에 추가/업데이트합니다.
    """
    if not os.path.exists(html_path):
        raise FileNotFoundError(f"원본 성경 HTML 파일('{html_path}')을 찾을 수 없습니다.")

    print(f"[{html_path}] 파일 읽는 중...")
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. books 메타데이터 파싱 (code -> name 매핑)
    m_b = re.search(r'const\s+books\s*=\s*(\[[\s\S]*?\]);', content)
    if not m_b:
        raise ValueError("viewer_niv.html 내에서 const books 배열을 찾을 수 없습니다.")
    books_meta = json.loads(m_b.group(1))
    book_name_map = {item["code"].lower(): item["name"] for item in books_meta}

    # 2. bibleData 파싱
    m_d = re.search(r'const\s+bibleData\s*=\s*(\[[\s\S]*?\]);', content)
    if not m_d:
        raise ValueError("viewer_niv.html 내에서 const bibleData 배열을 찾을 수 없습니다.")
    data = json.loads(m_d.group(1))
    print(f"NIV 영어성경 파싱 성공: 총 {len(data)}개 구절 추출됨.")

    # DB 연결
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 기존 NIV 데이터 삭제 후 인서트
    cursor.execute("DELETE FROM bible WHERE version_code = 'NIV'")

    rows = []
    for item in data:
        code = item["b"].lower()
        name = book_name_map.get(code, code)
        rows.append((
            "NIV",
            code,
            name,
            item["c"],
            item["v"],
            item["txt"],
            item.get("t")
        ))

    print(f"DB 저장 중... (NIV 총 {len(rows)}개 구절)")
    cursor.executemany("""
        INSERT INTO bible (version_code, book_code, book_name, chapter, verse, content, title)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, rows)

    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM bible WHERE version_code = 'NIV'")
    cnt = cursor.fetchone()[0]
    print(f"✅ NIV 영어성경 (NIV) DB 임포트 완료! 저장된 구절 수: {cnt}개")

    conn.close()
    return cnt

def parse_all(db_path="bible.db"):
    parse_and_import_krv(db_path=db_path)
    parse_and_import_easy(db_path=db_path)
    parse_and_import_niv(db_path=db_path)

if __name__ == "__main__":
    parse_all()
