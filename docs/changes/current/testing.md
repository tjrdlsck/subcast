# Testing & Verification Strategy: CHG-041-fix-root-url-redirect-to-static-index

## 1. 검증 시나리오 및 절차

### 1.1 엔드포인트 리다이렉션 코드 검증
- `@app.get("/")` 핸들러가 `RedirectResponse(url="/static/index.html")`를 반환하는지 수동/자동 검증

### 1.2 재빌드 및 Release 업로드 검증
- `dist/Subcast_Setup_v1.3.13.exe` 및 `dist/subcast-v1.3.13-windows.zip` 재생성 확인
- `rtk gh release view v1.3.13` 명령으로 갱신된 자산 등재 여부 확인
