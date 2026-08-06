# Testing: CHG-036-push-and-reusable-change-docs

## 문서 검증

- `docs/changes/current/`에 정확히 다섯 파일이 존재하는지 확인한다.
- 다섯 파일에 `CHG-036`의 승인된 내용이 반영되어 있는지 확인한다.
- Codex·Antigravity·오케스트레이터 규칙이 `current/` 경로를 가리키는지 확인한다.
- `archive-index.md`와 `project-state.md`가 과거 이력을 Git 커밋 기준으로 설명하는지 확인한다.

## 삭제 범위 검증

- 삭제 대상은 `docs/changes/CHG-*` 디렉터리로 한정한다.
- `docs/changes/current/`와 `docs/changes/archive-index.md`는 삭제하지 않는다.
- `backend/`, `frontend/`, `tests/`, `GAE_Bible.db`, 설정 파일은 삭제하지 않는다.

## 완료 기준

- 문서 검증이 통과한다.
- 기존 CHG 폴더가 작업 트리에서 제거된다.
- 현재 다섯 문서와 요약 인덱스가 남는다.
- 삭제 전후 보호 범위 목록이 동일하다.

## 테스트 계획 작성 양식

### 검증 종류

- 단위 테스트:
- 통합 테스트:
- UI 또는 수동 검증:
- 회귀 테스트:

### 실행 명령

```powershell
# 프로젝트 기준선 테스트 명령
```

### 실패 판정

- 기존 기준선 실패:
- 새 회귀 실패:
- 환경 또는 권한 문제:

### 공유 전 완료 조건

- [ ] 수락 기준을 모두 확인했다.
- [ ] 새 회귀 실패가 없다.
- [ ] 검증 로그와 미해결 위험을 기록했다.
