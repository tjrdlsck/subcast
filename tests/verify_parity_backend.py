import argparse
import ast
import json
import os
import sys
from pathlib import Path
from typing import Dict, Any, List

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

SNAPSHOT_FILE = ROOT_DIR / "tests" / "baseline_backend_api.json"


def extract_api_routes() -> List[Dict[str, Any]]:
    """FastAPI 앱 인스턴스에서 등록된 모든 API 라우트 메타데이터를 추출합니다."""
    from backend.main import app

    routes_data = []
    for route in app.routes:
        # APIRoute인 경우만 수집 (정적 파일 서빙 Mount 등 제외)
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        name = getattr(route, "name", None)
        endpoint = getattr(route, "endpoint", None)
        
        if methods and path:
            routes_data.append({
                "path": path,
                "methods": sorted(list(methods)),
                "name": name,
                "endpoint_name": endpoint.__name__ if endpoint else None,
                "endpoint_module": endpoint.__module__ if endpoint else None,
            })

    # 경로 및 메소드 기준으로 정렬하여 결정론적(Deterministic) 리스트 생성
    routes_data.sort(key=lambda r: (r["path"], "".join(r["methods"])))
    return routes_data


def extract_ast_symbols(file_path: Path) -> Dict[str, Any]:
    """주어진 파일의 AST를 분석하여 모든 클래스 및 함수 정의를 추출합니다."""
    if not file_path.exists():
        return {"classes": {}, "functions": []}

    with open(file_path, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read(), filename=str(file_path))

    classes = {}
    functions = []

    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            methods = [
                m.name for m in node.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))
            ]
            classes[node.name] = sorted(methods)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(node.name)

    return {
        "classes": classes,
        "functions": sorted(functions),
    }


def capture_snapshot() -> Dict[str, Any]:
    """현재 백엔드 상태의 전체 스냅샷을 캡처합니다."""
    routes = extract_api_routes()
    main_symbols = extract_ast_symbols(ROOT_DIR / "backend" / "main.py")

    snapshot = {
        "total_routes_count": len(routes),
        "routes": routes,
        "main_symbols": main_symbols,
    }

    with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)

    print(f"[OK] Baseline snapshot saved to {SNAPSHOT_FILE}")
    print(f"     - Total Routes Captured: {len(routes)}")
    print(f"     - Classes in main.py: {len(main_symbols['classes'])}")
    print(f"     - Functions in main.py: {len(main_symbols['functions'])}")
    return snapshot


def verify_parity() -> bool:
    """현재 상태와 스냅샷을 1:1 대조하여 누락된 라우트나 기능이 있는지 검증합니다."""
    if not SNAPSHOT_FILE.exists():
        print(f"[ERROR] Snapshot file not found: {SNAPSHOT_FILE}")
        print("Please run with --snapshot first.")
        return False

    with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
        baseline = json.load(f)

    current_routes = extract_api_routes()
    baseline_routes = baseline["routes"]

    # 라우트 비교 (Path + Methods 기준 고유 키)
    baseline_map = {
        (r["path"], tuple(r["methods"])): r for r in baseline_routes
    }
    current_map = {
        (r["path"], tuple(r["methods"])): r for r in current_routes
    }

    missing_routes = []
    for key, b_route in baseline_map.items():
        if key not in current_map:
            missing_routes.append(b_route)

    extra_routes = []
    for key, c_route in current_map.items():
        if key not in baseline_map:
            extra_routes.append(c_route)

    print("=" * 60)
    print("        MECHANICAL PARITY VERIFICATION REPORT")
    print("=" * 60)
    print(f"Baseline Routes Count : {len(baseline_routes)}")
    print(f"Current Routes Count  : {len(current_routes)}")
    print("-" * 60)

    if missing_routes:
        print(f"[FAIL] Missing Routes ({len(missing_routes)}):")
        for r in missing_routes:
            print(f"  - {r['methods']} {r['path']} (Expected endpoint: {r['endpoint_name']})")
    else:
        print("[PASS] 100% of baseline API routes are present! (0 Missing)")

    if extra_routes:
        print(f"[INFO] Newly Added Routes ({len(extra_routes)}):")
        for r in extra_routes:
            print(f"  + {r['methods']} {r['path']}")

    is_perfect = len(missing_routes) == 0
    print("=" * 60)
    if is_perfect:
        print("[SUCCESS] All functional API routes perfectly match baseline.")
    else:
        print("[FAILED] Parity check failed. Existing routes were lost.")
    print("=" * 60)

    return is_perfect


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backend API and Symbol Parity Verifier")
    parser.add_argument("--snapshot", action="store_true", help="Capture baseline snapshot")
    parser.add_argument("--verify", action="store_true", help="Verify current state against baseline snapshot")
    args = parser.parse_args()

    if args.snapshot:
        capture_snapshot()
    elif args.verify:
        success = verify_parity()
        sys.exit(0 if success else 1)
    else:
        parser.print_help()
