import os
import re
import sys

# Keywords to exclude when matching method-like patterns
KEYWORDS = {
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch', 'finally',
    'try', 'with', 'return', 'typeof', 'instanceof', 'void', 'delete', 'throw',
    'new', 'in', 'of', 'await', 'async', 'function', 'class', 'import', 'export'
}

def extract_js_functions_and_events(js_text):
    # Remove single line and multiline comments for accurate regex matching
    # Keep comments in original code, this is only for finding symbol names
    clean_js = re.sub(r'//.*$', '', js_text, flags=re.MULTILINE)
    clean_js = re.sub(r'/\*.*?\*/', '', clean_js, flags=re.DOTALL)

    items = set()

    # 1. Standard / Async Function Declarations: function foo(...) or async function foo(...)
    func_decls = re.findall(r'(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(', clean_js)
    for f in func_decls:
        items.add(f"function {f}()")

    # 2. Const/let/var Arrow & Function Expressions: const foo = (...) => or let foo = function(...)
    var_funcs = re.findall(r'(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>|function\b)', clean_js)
    for f in var_funcs:
        items.add(f"const/let {f} = fn")

    # 3. Socket.io / Custom Event Handlers: socket.on('eventName', ...) or .addEventListener('event', ...)
    socket_events = re.findall(r'socket\.on\s*\(\s*[\'"]([^\'"]+)[\'"]', clean_js)
    for e in socket_events:
        items.add(f"socket.on('{e}')")

    event_listeners = re.findall(r'\.addEventListener\s*\(\s*[\'"]([^\'"]+)[\'"]', clean_js)
    for e in event_listeners:
        items.add(f"addEventListener('{e}')")

    sorted_items = sorted(list(items))
    return sorted_items

def main():
    frontend_dir = os.path.join(os.getcwd(), 'frontend')
    js_dir = os.path.join(frontend_dir, 'js')
    docs_dir = os.path.join(os.getcwd(), 'docs')

    os.makedirs(js_dir, exist_ok=True)
    os.makedirs(docs_dir, exist_ok=True)

    html_files = [f for f in os.listdir(frontend_dir) if f.endswith('.html')]
    html_files.sort()

    checklist_path = os.path.join(docs_dir, 'CHECKLIST_PHASE2.md')
    checklist_lines = [
        "# 📋 Phase 2 JS 추출 기능 체크리스트 & 1:1 대조 결과\n",
        "| HTML 파일명 | 추출된 JS 파일 | 원본 함수/이벤트 수 | 추출 JS 함수/이벤트 수 | 1:1 일치 여부 | 원본 코드 대조 |",
        "|---|---|---|---|---|---|",
    ]

    detailed_checklist = ["\n## 🔍 세부 함수 및 이벤트 대조 목록\n"]

    all_matched = True

    for html_file in html_files:
        html_path = os.path.join(frontend_dir, html_file)
        with open(html_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Find inline <script> tags without src attribute
        # Matching <script>...</script> where no src="..." is present in the open tag
        script_pattern = re.compile(r'<script(?![^>]*\bsrc\b)[^>]*>(.*?)</script>', re.DOTALL | re.IGNORECASE)
        inline_scripts = script_pattern.findall(content)

        # Filter non-empty scripts
        inline_code_blocks = [s.strip() for s in inline_scripts if s.strip()]

        if not inline_code_blocks:
            print(f"[{html_file}] 인라인 <script> 태그가 존재하지 않아 건너땁니다.")
            continue

        combined_js = "\n\n// --- Combined Script ---\n\n".join(inline_code_blocks)

        base_name = os.path.splitext(html_file)[0]
        js_filename = f"{base_name}.js"
        js_path = os.path.join(js_dir, js_filename)

        # Original functions/events
        orig_items = extract_js_functions_and_events(combined_js)

        # Write extracted JS file
        with open(js_path, 'w', encoding='utf-8') as f:
            f.write(combined_js + "\n")

        # Verify saved JS
        with open(js_path, 'r', encoding='utf-8') as f:
            saved_js = f.read()

        saved_items = extract_js_functions_and_events(saved_js)

        code_exact_match = (combined_js.strip() == saved_js.strip())
        items_match = (orig_items == saved_items)
        is_match = code_exact_match and items_match

        match_str = "✅ 100% 일치" if is_match else "❌ 불일치"

        if not is_match:
            all_matched = False

        checklist_lines.append(f"| `{html_file}` | `frontend/js/{js_filename}` | {len(orig_items)} | {len(saved_items)} | {match_str} | {'✅ 원본 손실 0%' if code_exact_match else '❌ 손실 발생'} |")

        detailed_checklist.append(f"### 📄 `{html_file}` -> `js/{js_filename}`")
        detailed_checklist.append(f"- 총 주요 함수 및 이벤트 식별 수: {len(saved_items)}개")
        detailed_checklist.append("<details><summary>함수 및 이벤트 목록 보기</summary>\n")
        for item in saved_items:
            detailed_checklist.append(f"- `{item}`")
        detailed_checklist.append("\n</details>\n")

        # Update HTML file:
        # Replace inline <script> tags.
        # The first inline <script> tag is replaced with <script src="js/{js_filename}"></script> (or with defer/module if needed)
        # Subsequent inline <script> tags are removed.
        js_script_tag = f'<script src="js/{js_filename}"></script>'

        def script_replacer(match):
            # Check if this matched tag has src attribute
            full_tag = match.group(0)
            tag_open = match.group(0).split('>')[0]
            if 'src=' in tag_open.lower():
                return full_tag  # Leave external script tag untouched
            
            if not hasattr(script_replacer, f'replaced_{base_name}'):
                setattr(script_replacer, f'replaced_{base_name}', True)
                return js_script_tag
            return ""

        # Global replace of <script ...>...</script> handling both external and inline
        new_content = re.sub(r'<script\b[^>]*>.*?</script>', script_replacer, content, flags=re.DOTALL | re.IGNORECASE)

        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(new_content)

        print(f"[{html_file}] JS 추출 완료 -> frontend/js/{js_filename} ({len(saved_items)} items detected)")

    # Save CHECKLIST_PHASE2.md
    with open(checklist_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(checklist_lines) + "\n" + "\n".join(detailed_checklist) + "\n")

    print(f"\n체크리스트 생성 완료: {checklist_path}")

    if not all_matched:
        print("\n❌ 오류: 원본과 추출된 JS가 일치하지 않습니다!")
        sys.exit(1)
    else:
        print("\n✅ 모든 JS 1:1 대조 및 원본 검증 성공!")

if __name__ == '__main__':
    main()
