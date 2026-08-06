# Technical Design: CHG-041-fix-root-url-redirect-to-static-index

## 1. 세부 코드 설계

### `backend/main.py`
```python
from fastapi.responses import FileResponse, RedirectResponse

@app.get("/")
async def get_index():
    return RedirectResponse(url="/static/index.html")
```

### `run.py`
```python
# 브라우저 오픈 URL을 static/index.html 포함 경로로 수정
webbrowser.open(f"http://127.0.0.1:{config['port']}/static/index.html")
```
