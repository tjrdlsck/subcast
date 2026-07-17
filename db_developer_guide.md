# 개역개정 성경 SQLite 데이터베이스 개발자 가이드

이 문서는 구축된 개역개정 성경 데이터베이스(`GAE_Bible.db`)를 다른 애플리케이션 및 시스템에서 외부 연동하여 활용하려는 소프트웨어 개발자(Developer)들을 위한 상세 연동 스크립트 및 스키마 명세서입니다.

---

## 1. 데이터베이스 개요 (Database Overview)
- **DBMS**: SQLite 3
- **파일명**: `GAE_Bible.db`
- **인코딩**: UTF-8
- **총 레코드 수**: 31,102 개 구절 내외

---

## 2. 테이블 스키마 및 인덱스 구조 (Table Schema & Index)

### A. `bible` 테이블 정의
성경 구절 및 메타데이터를 저장하는 핵심 단일 테이블 구조입니다.

| 컬럼명 (Column) | 데이터 타입 (Type) | 제약 조건 (Constraint) | 설명 (Description) |
| :--- | :--- | :--- | :--- |
| **`id`** | `INTEGER` | PRIMARY KEY AUTOINCREMENT | 시스템 고유 레코드 식별 번호 (1부터 순차 증가) |
| **`book_code`** | `TEXT` | NOT NULL | 성경 권별 영문 고유 약어 코드 (예: `gen` - 창세기, `rev` - 요한계시록) |
| **`book_name`** | `TEXT` | NOT NULL | 성경 권별 공식 한글 명칭 (예: `창세기`, `요한계시록`) |
| **`chapter`** | `INTEGER` | NOT NULL | 장 번호 (1부터 시작, 시편 최대 150장) |
| **`verse`** | `INTEGER` | NOT NULL | 절 번호 (1부터 시작) |
| **`content`** | `TEXT` | NOT NULL | 주석 및 노이즈가 완벽히 제거되어 정제된 본문 텍스트 |
| **`title`** | `TEXT` | NULL 허용 | 해당 절의 상단에 정의된 문단 소제목 (없는 경우 `NULL`) |

### B. 인덱스 명세 (Index Specification)
조회 성능 최적화를 위해 다중 컬럼(Multi-Column)을 묶은 **복합 인덱스(Composite Index)**가 기본 적용되어 있습니다.

- **인덱스 명**: `idx_bible_coords`
- **인덱스 대상 컬럼**: `(book_code, chapter, verse)`
- **효과**: 특정 성경 구절을 범위 조회하거나 단일 포인트 쿼리할 때, 시간 복잡도가 선형 탐색 $\mathcal{O}(N)$에서 이진 트리 탐색 $\mathcal{O}(\log N)$으로 최적화됩니다.

---

## 3. 자주 쓰이는 SQL 쿼리 템플릿 (Common SQL Patterns)

### A. 특정 책의 특정 장 전체 조회
```sql
SELECT verse, content, title 
FROM bible 
WHERE book_code = 'gen' AND chapter = 1 
ORDER BY verse ASC;
```

### B. 특정 단어가 포함된 본문 키워드 검색
```sql
SELECT book_name, chapter, verse, content 
FROM bible 
WHERE content LIKE '%태초에%' 
ORDER BY id ASC;
```

### C. 소제목이 존재하는 구절만 추출
```sql
SELECT book_name, chapter, verse, title, content 
FROM bible 
WHERE title IS NOT NULL 
ORDER BY id ASC;
```

---

## 4. 프로그래밍 언어별 연동 코드 예시 (Integration Examples)

### A. Python (내장 `sqlite3` 모듈)
별도의 드라이버 설치 없이 파이썬 표준 라이브러리로 즉시 작동하는 연동 풀 코드 예제입니다.

```python
import sqlite3
import os

class BibleDatabaseHelper:
    def __init__(self, db_path="GAE_Bible.db"):
        self.db_path = db_path

    def get_connection(self):
        # sqlite3 커넥션 맺기 및 사전 딕셔너리 형태로 결과 매핑 설정
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_chapter(self, book_code: str, chapter: int):
        """
        특정 책의 특정 장 데이터를 리스트 객체로 반환합니다.
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT verse, content, title 
            FROM bible 
            WHERE book_code = ? AND chapter = ?
            ORDER BY verse ASC
        """
        
        try:
            cursor.execute(query, (book_code, chapter))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def search_keyword(self, keyword: str):
        """
        성경 전체에서 키워드를 검색합니다.
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT book_name, chapter, verse, content 
            FROM bible 
            WHERE content LIKE ?
            ORDER BY id ASC
        """
        
        try:
            # SQL Injection 방지를 위한 와일드카드 결합 매핑
            search_param = f"%{keyword}%"
            cursor.execute(query, (search_param,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

# --- 실행 및 검증 예시 ---
if __name__ == "__main__":
    db_helper = BibleDatabaseHelper("GAE_Bible.db")
    
    # 1. 창세기 1장 가져오기 테스트
    genesis_1 = db_helper.get_chapter("gen", 1)
    print(f"[Info] 창세기 1장 구절 개수: {len(genesis_1)}")
    if genesis_1:
        print(f"창세기 1:1 -> {genesis_1[0]['content']} (소제목: {genesis_1[0]['title']})")
        
    # 2. 키워드 검색 테스트
    search_results = db_helper.search_keyword("천지")
    print(f"[Info] '천지' 검색 결과 건수: {len(search_results)}")
```
