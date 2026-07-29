# 📋 Phase 4 백엔드 모듈화 & API 스펙 1:1 대조 체크리스트

| 원본 API 경로 수 | 모듈화 후 API 경로 수 | 1:1 일치 여부 | 누락 라우트 수 |
|---|---|---|---|
| 26개 | 26개 | ✅ 100% 일치 | 0개 |

## 🔍 API 엔드포인트 1:1 추출 대조 목록

- `DELETE /api/projects/{project_id}`
- `GET /`
- `GET /api/bible/books`
- `GET /api/bible/read`
- `GET /api/bible/search`
- `GET /api/praise/export`
- `GET /api/praise/search`
- `GET /api/projects`
- `GET /api/projects/{project_id}/export`
- `GET /api/system/check-update`
- `GET /api/system/version`
- `GET /api/templates/export`
- `PATCH /api/projects/{project_id}`
- `POST /api/praise/delete`
- `POST /api/praise/import`
- `POST /api/praise/save`
- `POST /api/projects`
- `POST /api/projects/delete-bulk`
- `POST /api/projects/duplicate-bulk`
- `POST /api/projects/export-bulk`
- `POST /api/projects/import`
- `POST /api/projects/{project_id}/select`
- `POST /api/system/auto-update`
- `POST /api/templates/import`
- `PUT /api/projects/{project_id}`
- `WEBSOCKET /ws`
