import pytest
from fastapi.testclient import TestClient
from backend.main import app, db_helper

client = TestClient(app)

def test_bible_db_krv_import():
    """DB에 개역개정 (KRV) 데이터 31,084개 구절이 정밀 임포트되었는지 검증"""
    books = db_helper.get_books(version_code="KRV")
    assert len(books) == 66, f"성경 66권이 조회되어야 합니다. (실제: {len(books)}권)"
    
    # 창세기 1장 조회 테스트
    gen_verses = db_helper.get_chapter(book_code="gen", chapter=1, version_code="KRV")
    assert len(gen_verses) == 31, f"창세기 1장은 31구절이어야 합니다. (실제: {len(gen_verses)}구절)"
    assert gen_verses[0]["content"] == "태초에 하나님이 천지를 창조하시니라"
    
    # 요한계시록 22장 조회 테스트
    rev_verses = db_helper.get_chapter(book_code="rev", chapter=22, version_code="KRV")
    assert len(rev_verses) == 21, f"요한계시록 22장은 21구절이어야 합니다. (실제: {len(rev_verses)}구절)"
    assert "주 예수의 은혜가" in rev_verses[-1]["content"]

def test_bible_api_endpoints():
    """백엔드 REST API 성경 조회 및 검색 검증"""
    # 1. 성경 책 목록 API
    res_books = client.get("/api/bible/books?version=KRV")
    assert res_books.status_code == 200
    data_books = res_books.json()
    assert len(data_books) == 66
    
    # 2. 성경 본문 읽기 API
    res_read = client.get("/api/bible/read?book_code=gen&chapter=1&version=KRV")
    assert res_read.status_code == 200
    data_read = res_read.json()
    assert data_read["book_name"] == "창세기"
    assert len(data_read["verses"]) == 31
    
    # 3. 성경 검색 API (키워드: "태초에")
    res_search = client.get("/api/bible/search?query=태초에&version=KRV")
    assert res_search.status_code == 200
    data_search = res_search.json()
    assert data_search["total_results"] > 0
    assert any("천지를 창조하시니라" in item["content"] for item in data_search["results"])

def test_bible_db_easy_import():
    """DB에 쉬운성경 (EASY) 데이터 31,102개 구절이 정밀 임포트되었는지 검증"""
    books = db_helper.get_books(version_code="EASY")
    assert len(books) == 66, f"성경 66권이 조회되어야 합니다. (실제: {len(books)}권)"
    
    # 창세기 1장 조회 테스트
    gen_verses = db_helper.get_chapter(book_code="gen", chapter=1, version_code="EASY")
    assert len(gen_verses) > 0
    assert gen_verses[0]["content"] == "태초에 하나님께서 하늘과 땅을 창조하셨습니다."
    
    # REST API 테스트
    res_read = client.get("/api/bible/read?book_code=gen&chapter=1&version=EASY")
    assert res_read.status_code == 200
    data_read = res_read.json()
    assert data_read["verses"][0]["content"] == "태초에 하나님께서 하늘과 땅을 창조하셨습니다."
    
    # 검색 API 테스트
    res_search = client.get("/api/bible/search?query=하나님께서&version=EASY")
    assert res_search.status_code == 200
    assert res_search.json()["total_results"] > 0

def test_bible_db_niv_import():
    """DB에 NIV 영어성경 (NIV) 데이터 31,038개 구절이 정밀 임포트되었는지 검증"""
    books = db_helper.get_books(version_code="NIV")
    assert len(books) == 66, f"성경 66권이 조회되어야 합니다. (실제: {len(books)}권)"
    
    # 창세기 1장 조회 테스트
    gen_verses = db_helper.get_chapter(book_code="gen", chapter=1, version_code="NIV")
    assert len(gen_verses) == 31
    assert gen_verses[0]["content"] == "In the beginning God created the heavens and the earth."
    
    # REST API 테스트
    res_read = client.get("/api/bible/read?book_code=gen&chapter=1&version=NIV")
    assert res_read.status_code == 200
    data_read = res_read.json()
    assert data_read["verses"][0]["content"] == "In the beginning God created the heavens and the earth."
    
    # 검색 API 테스트 (키워드: "beginning")
    res_search = client.get("/api/bible/search?query=beginning&version=NIV")
    assert res_search.status_code == 200
    assert res_search.json()["total_results"] > 0
