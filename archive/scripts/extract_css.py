import os
import re
import sys

def extract_selectors(css_text):
    # Remove CSS comments
    css_no_comments = re.sub(r'/\*.*?\*/', '', css_text, flags=re.DOTALL)
    # Find selector blocks before '{'
    # Exclude @keyframes steps like '0%', '100%', 'from', 'to' or nested @rules if any, but capture standard selectors
    raw_matches = re.findall(r'([^{}\s][^{}]*)\s*\{', css_no_comments)
    selectors = []
    for match in raw_matches:
        match_clean = match.strip()
        if match_clean.startswith('@import') or match_clean.startswith('@charset'):
            continue
        # Split grouped selectors like "h1, h2, h3"
        sub_selectors = [s.strip() for s in match_clean.split(',') if s.strip()]
        selectors.extend(sub_selectors)
    return selectors

def main():
    frontend_dir = os.path.join(os.getcwd(), 'frontend')
    css_dir = os.path.join(frontend_dir, 'css')
    docs_dir = os.path.join(os.getcwd(), 'docs')
    
    os.makedirs(css_dir, exist_ok=True)
    os.makedirs(docs_dir, exist_ok=True)
    
    html_files = [f for f in os.listdir(frontend_dir) if f.endswith('.html')]
    html_files.sort()
    
    checklist_path = os.path.join(docs_dir, 'CHECKLIST_PHASE1.md')
    checklist_lines = [
        "# 📋 Phase 1 CSS 추출 기능 체크리스트 & 1:1 대조 결과\n",
        "| HTML 파일명 | 추출된 CSS 파일 | 원본 셀렉터 수 | 추출 셀렉터 수 | 1:1 일치 여부 |",
        "|---|---|---|---|---|",
    ]
    
    detailed_checklist = ["\n## 🔍 세부 셀렉터 대조 목록\n"]
    
    all_matched = True
    
    for html_file in html_files:
        html_path = os.path.join(frontend_dir, html_file)
        with open(html_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find all <style> blocks
        style_blocks = re.findall(r'<style\b[^>]*>(.*?)</style>', content, flags=re.DOTALL | re.IGNORECASE)
        
        if not style_blocks:
            print(f"[{html_file}] <style> 태그가 존재하지 않아 건너땁니다.")
            continue
            
        combined_css = "\n\n".join(b.strip() for b in style_blocks if b.strip())
        if not combined_css:
            print(f"[{html_file}] <style> 태그 내용이 비어있어 건너땁니다.")
            continue
            
        base_name = os.path.splitext(html_file)[0]
        css_filename = f"{base_name}.css"
        css_path = os.path.join(css_dir, css_filename)
        
        # Original selectors
        orig_selectors = extract_selectors(combined_css)
        
        # Write extracted CSS file
        with open(css_path, 'w', encoding='utf-8') as f:
            f.write(combined_css + "\n")
            
        # Verify saved CSS
        with open(css_path, 'r', encoding='utf-8') as f:
            saved_css = f.read()
            
        saved_selectors = extract_selectors(saved_css)
        
        is_match = (orig_selectors == saved_selectors) and (combined_css.strip() == saved_css.strip())
        match_str = "✅ 100% 일치" if is_match else "❌ 불일치"
        
        if not is_match:
            all_matched = False
            
        checklist_lines.append(f"| `{html_file}` | `frontend/css/{css_filename}` | {len(orig_selectors)} | {len(saved_selectors)} | {match_str} |")
        
        detailed_checklist.append(f"### 📄 `{html_file}` -> `css/{css_filename}`")
        detailed_checklist.append(f"- 총 셀렉터 개수: {len(saved_selectors)}개")
        detailed_checklist.append("<details><summary>셀렉터 목록 보기</summary>\n")
        for sel in saved_selectors:
            detailed_checklist.append(f"- `{sel}`")
        detailed_checklist.append("\n</details>\n")
        
        # Update HTML file: Replace <style> blocks with <link> tag
        # Replace the first <style>...</style> with <link rel="stylesheet" href="css/{css_filename}">
        # and remove subsequent <style>...</style> blocks
        css_link_tag = f'<link rel="stylesheet" href="css/{css_filename}">'
        
        def style_replacer(match):
            if not hasattr(style_replacer, 'replaced'):
                style_replacer.replaced = True
                return css_link_tag
            return ""
            
        new_content = re.sub(r'<style\b[^>]*>.*?</style>', style_replacer, content, flags=re.DOTALL | re.IGNORECASE)
        
        # Clean up any leftover empty lines created by removing <style> tags
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        print(f"[{html_file}] CSS 추출 완료 -> frontend/css/{css_filename} ({len(saved_selectors)} selectors)")

    # Save CHECKLIST_PHASE1.md
    with open(checklist_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(checklist_lines) + "\n" + "\n".join(detailed_checklist) + "\n")
        
    print(f"\n체크리스트 생성 완료: {checklist_path}")
    
    if not all_matched:
        print("\n❌ 오류: 원본과 추출된 CSS가 일치하지 않습니다!")
        sys.exit(1)
    else:
        print("\n✅ 모든 CSS 1:1 대조 및 검증 성공!")

if __name__ == '__main__':
    main()
