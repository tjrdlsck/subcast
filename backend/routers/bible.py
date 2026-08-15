from fastapi import APIRouter, HTTPException, Query

from backend.services.bible_service import db_helper

router = APIRouter(prefix="/api/bible", tags=["bible"])


@router.get("/books")
async def get_bible_books(version: str = Query("KRV")):
    try:
        return db_helper.get_books(version_code=version)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/read")
async def read_bible(
    book_code: str,
    chapter: int,
    start_verse: int = Query(1),
    end_verse: int = Query(999),
    version: str = Query("KRV")
):
    try:
        verses = db_helper.get_chapter(book_code, chapter, start_verse, end_verse, version_code=version)
        if not verses:
            return {"book_name": "", "book_code": book_code, "chapter": chapter, "verses": []}
        return {
            "book_name": verses[0]["book_name"],
            "book_code": book_code,
            "chapter": chapter,
            "verses": [{"verse": v["verse"], "content": v["content"], "title": v["title"]} for v in verses]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_bible(
    query: str,
    limit: int = Query(50),
    version: str = Query("KRV")
):
    if len(query.strip()) < 2:
        raise HTTPException(status_code=400, detail="검색어는 공백 제외 2글자 이상 입력해 주세요.")
    try:
        results = db_helper.search_keyword(query.strip(), limit, version_code=version)
        return {
            "query": query,
            "total_results": len(results),
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
