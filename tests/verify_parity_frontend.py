import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, Any, List, Set

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

SNAPSHOT_FILE = ROOT_DIR / "tests" / "baseline_frontend.json"
EDITOR_HTML = ROOT_DIR / "frontend" / "editor.html"
MODULES_DIR = ROOT_DIR / "frontend" / "js" / "modules"


def extract_html_metadata(html_path: Path) -> Dict[str, Any]:
    """HTML 파일에서 모든 고유 DOM id, data-target 속성, 로드되는 script 파일 목록을 추출합니다."""
    if not html_path.exists():
        return {"ids": [], "scripts": []}

    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 모든 id="..." 추출
    id_pattern = re.compile(r'id=["\']([^"\']+)["\']')
    ids = sorted(list(set(id_pattern.findall(content))))

    # 모든 <script src="..."> 추출
    script_pattern = re.compile(r'<script\s+[^>]*src=["\']([^"\']+)["\']', re.IGNORECASE)
    scripts = script_pattern.findall(content)

    return {
        "ids": ids,
        "ids_count": len(ids),
        "scripts": scripts,
    }


def extract_js_exported_symbols() -> Dict[str, List[str]]:
    """모듈 JS 파일들에서 window 또는 전역에 바인딩되거나 정의된 함수명들을 추출합니다."""
    symbols = {}
    if not MODULES_DIR.exists():
        return symbols

    func_pattern = re.compile(r'(?:function\s+([a-zA-Z0-9_$]+)\s*\(|window\.([a-zA-Z0-9_$]+)\s*=)')

    for js_file in sorted(MODULES_DIR.glob("*.js")):
        with open(js_file, "r", encoding="utf-8") as f:
            content = f.read()
        
        matches = func_pattern.findall(content)
        funcs = set()
        for f1, f2 in matches:
            name = f1 or f2
            if name and not name.startswith("_"):
                funcs.add(name)

        symbols[js_file.name] = sorted(list(funcs))

    return symbols


def capture_snapshot() -> Dict[str, Any]:
    """현재 프론트엔드 DOM ID 및 모듈 심볼의 기준선 스냅샷을 저장합니다."""
    html_meta = extract_html_metadata(EDITOR_HTML)
    js_symbols = extract_js_exported_symbols()

    snapshot = {
        "html": html_meta,
        "js_symbols": js_symbols,
    }

    with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)

    print(f"[OK] Frontend baseline snapshot saved to {SNAPSHOT_FILE}")
    print(f"     - Total DOM IDs Captured in editor.html: {html_meta['ids_count']}")
    print(f"     - Total JS Modules Analyzed: {len(js_symbols)}")
    return snapshot


def verify_parity() -> bool:
    """현재 상태와 스냅샷을 1:1 대조하여 DOM ID 누락이 있는지 검증합니다."""
    if not SNAPSHOT_FILE.exists():
        print(f"[ERROR] Snapshot file not found: {SNAPSHOT_FILE}")
        print("Please run with --snapshot first.")
        return False

    with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
        baseline = json.load(f)

    current_html = extract_html_metadata(EDITOR_HTML)
    
    baseline_ids = set(baseline["html"]["ids"])
    current_ids = set(current_html["ids"])

    missing_ids = baseline_ids - current_ids
    extra_ids = current_ids - baseline_ids

    print("=" * 60)
    print("        FRONTEND MECHANICAL PARITY REPORT")
    print("=" * 60)
    print(f"Baseline DOM IDs Count : {len(baseline_ids)}")
    print(f"Current DOM IDs Count  : {len(current_ids)}")
    print("-" * 60)

    if missing_ids:
        print(f"[FAIL] Missing DOM IDs ({len(missing_ids)}):")
        for mid in sorted(list(missing_ids)):
            print(f"  - id=\"{mid}\"")
    else:
        print("[PASS] 100% of baseline DOM IDs are preserved! (0 Missing)")

    if extra_ids:
        print(f"[INFO] Newly Added DOM IDs ({len(extra_ids)}):")
        for eid in sorted(list(extra_ids)):
            print(f"  + id=\"{eid}\"")

    # 스크립트 파일 존재 검증
    print("-" * 60)
    missing_scripts = []
    for script_src in current_html["scripts"]:
        if script_src.startswith("http"):
            continue
        # 상대 경로 검증 (frontend/ 기준)
        clean_src = script_src.lstrip("/")
        if clean_src.startswith("static/"):
            clean_src = clean_src[len("static/"):]
        target_path = ROOT_DIR / "frontend" / clean_src
        if not target_path.exists():
            missing_scripts.append(script_src)

    if missing_scripts:
        print(f"[FAIL] Missing Script Files ({len(missing_scripts)}):")
        for s in missing_scripts:
            print(f"  - {s}")
    else:
        print(f"[PASS] All {len(current_html['scripts'])} scripts in editor.html exist on disk.")

    is_perfect = len(missing_ids) == 0 and len(missing_scripts) == 0
    print("=" * 60)
    if is_perfect:
        print("[SUCCESS] Frontend mechanical parity check PASSED.")
    else:
        print("[FAILED] Frontend parity check failed.")
    print("=" * 60)

    return is_perfect


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Frontend Parity Verifier")
    parser.add_argument("--snapshot", action="store_true", help="Capture frontend snapshot")
    parser.add_argument("--verify", action="store_true", help="Verify frontend state against baseline snapshot")
    args = parser.parse_args()

    if args.snapshot:
        capture_snapshot()
    elif args.verify:
        success = verify_parity()
        sys.exit(0 if success else 1)
    else:
        parser.print_help()
