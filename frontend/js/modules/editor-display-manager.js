/**
 * editor-display-manager.js
 * Subcast 멀티 모니터 자동 분할 송출 (Multi-Screen Window Placement) 전담 모듈
 * 
 * - 최신 Window Management API를 활용하여 연결된 물리적 디스플레이 자동 감지
 * - Subcast 표준 디자인 시스템(Design Tokens)과 100% 일치된 UI 룩앤필 적용
 * - 단일 모니터/권한 대기 시에도 즉시 반응하는 무중단 Fallback 렌더링
 * - Home, Editor, Presenter 등 모든 페이지에서 공통 동작
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'subcast_multiscreen_config';
    const VIEW_DEFINITIONS = {
        'none': { label: '[미사용] 띄우지 않음', url: null },
        'stage_viewer': { label: '[현장 뷰어] 자막 + 배경 (Stage)', url: '/static/viewer.html?channel=stage&autofullscreen=true' },
        'stage_monitor': { label: '[무대 모니터] 프롬프터 (Monitor)', url: '/static/monitor.html?autofullscreen=true' }
    };

    let activeChildWindows = [];
    let cachedScreens = [];
    let isWatchingScreens = false;

    // 저장된 설정 불러오기
    function loadSavedConfig() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { mappings: [] };
        } catch (e) {
            console.warn('[DisplayManager] 설정 로드 실패:', e);
            return { mappings: [] };
        }
    }

    // 설정 영구 저장
    function saveConfig(config) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        } catch (e) {
            console.warn('[DisplayManager] 설정 저장 실패:', e);
        }
    }

    // 기본 단일 화면 객체 생성
    function getFallbackScreen() {
        return [{
            isPrimary: true,
            isInternal: true,
            label: '기본 디스플레이 (단일 모니터/테스트)',
            width: window.screen.width || 1920,
            height: window.screen.height || 1080,
            availLeft: 0,
            availTop: 0,
            availWidth: window.screen.availWidth || 1920,
            availHeight: window.screen.availHeight || 1080
        }];
    }

    // Subcast 표준 디자인 시스템과 100% 일치하는 모달 생성
    function ensureModalExists() {
        let modal = document.getElementById('modal-display-manager');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modal-display-manager';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); z-index: 99999; align-items: center; justify-content: center;';
        
        modal.innerHTML = `
            <div class="modal-content" style="width: 540px; max-width: 90vw; background: #111827; border: 1px solid var(--panel-border, rgba(255, 255, 255, 0.08)); border-radius: var(--radius-lg, 14px); padding: 22px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); font-family: 'Outfit', 'Pretendard', 'Inter', sans-serif;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="margin: 0; color: var(--text-main, #f9fafb); font-size: 1.05rem; font-weight: 600;">
                        멀티 디스플레이 송출 설정
                    </h3>
                    <span id="btn-display-modal-close" style="cursor: pointer; font-size: 1.5rem; color: var(--text-muted, #9ca3af); line-height: 1;">&times;</span>
                </div>
                <div class="modal-body" style="padding-top: 0; display: flex; flex-direction: column; gap: 12px;">
                    <div style="font-size: 0.78rem; color: var(--text-muted, #9ca3af); display: flex; justify-content: space-between; align-items: center;">
                        <span>각 모니터에 송출할 화면을 지정해 주세요.</span>
                        <span id="display-status-notice" style="color: var(--primary, #6366f1); font-weight: 600;"></span>
                    </div>

                    <div id="display-cards-list" class="custom-scrollbar" style="max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px;">
                        <!-- 동적 카드 목록 -->
                    </div>

                    <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--panel-border, rgba(255, 255, 255, 0.08)); border-radius: var(--radius-sm, 6px); padding: 8px 12px; font-size: 0.75rem; color: var(--text-muted, #9ca3af); line-height: 1.4;">
                        💡 여러 모니터에 동일한 화면(예: 현장 뷰어)을 중복 지정할 수 있습니다. 1번 주 화면은 <code>[미사용]</code>으로 유지하는 것을 권장합니다.
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; border-top: 1px solid var(--panel-border, rgba(255, 255, 255, 0.08)); padding-top: 12px;">
                    <button type="button" class="btn-modal" id="btn-display-stop-cast" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; padding: 7px 14px; font-size: 0.8rem; border-radius: var(--radius-sm, 6px); font-weight: 600; cursor: pointer; transition: all 0.2s;">모든 송출 창 닫기</button>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn-modal btn-cancel" id="btn-display-modal-cancel" style="padding: 7px 14px; font-size: 0.8rem; border-radius: var(--radius-sm, 6px); cursor: pointer;">취소</button>
                        <button type="button" class="btn-modal btn-confirm" id="btn-display-start-cast" style="background: var(--primary, #6366f1); color: white; padding: 7px 18px; font-size: 0.8rem; border-radius: var(--radius-sm, 6px); font-weight: 600; cursor: pointer; border: none;">일괄 송출 시작</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 이벤트 바인딩
        modal.querySelector('#btn-display-modal-close').onclick = closeDisplayModal;
        modal.querySelector('#btn-display-modal-cancel').onclick = closeDisplayModal;
        modal.querySelector('#btn-display-start-cast').onclick = startMultiScreenCast;
        modal.querySelector('#btn-display-stop-cast').onclick = () => {
            closeAllCastWindows();
            closeDisplayModal();
        };

        modal.onclick = (e) => {
            if (e.target === modal) closeDisplayModal();
        };

        return modal;
    }

    // 모달 열기 (0초 즉시 반응)
    window.openDisplayModal = function () {
        const modal = ensureModalExists();
        modal.style.setProperty('display', 'flex', 'important');

        try {
            if (!cachedScreens || cachedScreens.length === 0) {
                cachedScreens = getFallbackScreen();
            }
            renderScreenCards(cachedScreens);
        } catch (e) {
            console.error('[DisplayManager] renderScreenCards 에러:', e);
        }

        queryLiveScreens().catch(e => console.warn('[DisplayManager] queryLiveScreens 경고:', e));
    };

    // 모달 닫기
    window.closeDisplayModal = function () {
        const modal = document.getElementById('modal-display-manager');
        if (modal) modal.style.display = 'none';
    };

    // 비동기 디스플레이 탐색
    async function queryLiveScreens() {
        if ('getScreenDetails' in window) {
            try {
                const screenDetails = await window.getScreenDetails();
                
                if (!isWatchingScreens) {
                    screenDetails.addEventListener('screenschange', () => {
                        console.log('[DisplayManager] 모니터 변경 감지됨');
                        if (document.getElementById('modal-display-manager')?.style.display === 'flex') {
                            queryLiveScreens();
                        }
                    });
                    isWatchingScreens = true;
                }

                if (screenDetails && screenDetails.screens && screenDetails.screens.length > 0) {
                    cachedScreens = screenDetails.screens;
                    renderScreenCards(cachedScreens);
                }
            } catch (err) {
                console.warn('[DisplayManager] getScreenDetails 예외:', err);
            }
        }
    }

    // 카드 목록 렌더링 (Subcast 표준 컴포넌트 룩앤필)
    function renderScreenCards(screens) {
        const listContainer = document.getElementById('display-cards-list');
        const statusNotice = document.getElementById('display-status-notice');
        if (!listContainer) return;

        const savedConfig = loadSavedConfig();
        const mappings = savedConfig.mappings || [];

        if (statusNotice) {
            statusNotice.innerText = `감지된 디스플레이: ${screens.length}대`;
        }

        listContainer.innerHTML = '';

        screens.forEach((screen, idx) => {
            const isPrimary = screen.isPrimary ?? (idx === 0);
            const resText = `${screen.width || screen.availWidth} × ${screen.height || screen.availHeight}`;
            const labelText = screen.label || (isPrimary ? `디스플레이 1 (주 화면)` : `디스플레이 ${idx + 1}`);

            let currentView = mappings[idx]?.assignedView;
            if (currentView === undefined) {
                if (isPrimary) currentView = 'none';
                else if (idx === 1) currentView = 'stage_viewer';
                else if (idx === 2) currentView = 'stage_monitor';
                else currentView = 'none';
            }

            const card = document.createElement('div');
            card.className = `display-slot-card ${isPrimary ? 'is-primary' : ''}`;

            card.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 3px; flex: 1;">
                    <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-main, #f9fafb); display: flex; align-items: center; gap: 6px;">
                        <span>${labelText}</span>
                        ${isPrimary ? '<span style="font-size: 0.68rem; background: var(--primary, #6366f1); color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: 600;">주 화면</span>' : ''}
                    </div>
                    <div style="font-size: 0.74rem; color: var(--text-muted, #9ca3af);">
                        해상도: ${resText} | 좌표: (${screen.availLeft || 0}, ${screen.availTop || 0})
                    </div>
                </div>
                <div style="min-width: 200px;">
                    <select class="display-select-view" data-screen-index="${idx}" style="
                        width: 100%;
                        padding: 7px 10px;
                        background: rgba(0, 0, 0, 0.4);
                        border: 1px solid var(--panel-border, rgba(255, 255, 255, 0.1));
                        border-radius: var(--radius-sm, 6px);
                        color: var(--text-main, #f9fafb);
                        font-size: 0.8rem;
                        cursor: pointer;
                        outline: none;
                        font-family: inherit;
                    ">
                        ${Object.entries(VIEW_DEFINITIONS).map(([key, def]) => `
                            <option value="${key}" ${currentView === key ? 'selected' : ''}>${def.label}</option>
                        `).join('')}
                    </select>
                </div>
            `;

            listContainer.appendChild(card);
        });

        // 설정 변경 즉시 저장
        listContainer.querySelectorAll('.display-select-view').forEach(select => {
            select.addEventListener('change', () => {
                saveCurrentModalSettings();
            });
        });
    }

    // 현재 설정 저장
    function saveCurrentModalSettings() {
        const selects = document.querySelectorAll('.display-select-view');
        const mappings = [];

        selects.forEach(select => {
            const idx = parseInt(select.getAttribute('data-screen-index'), 10);
            const assignedView = select.value;
            mappings[idx] = { screenIndex: idx, assignedView };
        });

        saveConfig({ mappings });
    }

    // [일괄 송출 시작]
    window.startMultiScreenCast = function () {
        saveCurrentModalSettings();
        const savedConfig = loadSavedConfig();
        const mappings = savedConfig.mappings || [];

        const screens = cachedScreens.length > 0 ? cachedScreens : getFallbackScreen();

        closeAllCastWindows();
        let launchedCount = 0;

        screens.forEach((screen, idx) => {
            const viewType = mappings[idx]?.assignedView || 'none';
            const def = VIEW_DEFINITIONS[viewType];

            if (def && def.url) {
                const winName = `Subcast_Display_${idx}_${viewType}`;
                const left = screen.availLeft || 0;
                const top = screen.availTop || 0;
                const width = screen.availWidth || 1280;
                const height = screen.availHeight || 720;

                const specs = `left=${left},top=${top},width=${width},height=${height},` +
                              `menubar=no,toolbar=no,location=no,status=no,resizable=yes,popup=1`;

                try {
                    const win = window.open(def.url, winName, specs);
                    if (win) {
                        activeChildWindows.push(win);
                        launchedCount++;
                    }
                } catch (err) {
                    console.error(`[DisplayManager] 모니터 ${idx} 창 열기 실패:`, err);
                }
            }
        });

        updateCastStatusUI();

        if (launchedCount > 0) {
            closeDisplayModal();
            console.log(`[DisplayManager] ${launchedCount}개 화면 송출 시작`);
        } else {
            alert('송출하도록 설정된 모니터가 없습니다. 드롭다운에서 송출할 화면을 선택해 주세요.');
        }
    };

    // [모든 송출 창 닫기]
    window.closeAllCastWindows = function () {
        if (activeChildWindows.length > 0) {
            activeChildWindows.forEach(win => {
                try {
                    if (win && !win.closed) win.close();
                } catch (e) {}
            });
            activeChildWindows = [];
        }
        updateCastStatusUI();
    };

    // 상단 버튼 상태 갱신
    function updateCastStatusUI() {
        const btns = document.querySelectorAll('.btn-multi-cast');
        const activeCount = activeChildWindows.filter(w => w && !w.closed).length;

        btns.forEach(btn => {
            if (activeCount > 0) {
                btn.classList.add('active-casting');
                btn.innerHTML = `<span style="background: var(--green-online, #10b981); width:6px; height:6px; border-radius:50%; display:inline-block; margin-right:4px; box-shadow:0 0 6px var(--green-online, #10b981);"></span>송출 중 (${activeCount})`;
            } else {
                btn.classList.remove('active-casting');
                btn.innerHTML = `멀티 송출`;
            }
        });
    }

    // 에디터/창 닫힐 때 자식 창 정리
    window.addEventListener('beforeunload', () => {
        closeAllCastWindows();
    });

    // 글로벌 초기화 함수
    window.initDisplayManager = function () {
        const btns = document.querySelectorAll('.btn-multi-cast');
        btns.forEach(btn => {
            btn.onclick = () => window.openDisplayModal();
        });

        setInterval(() => {
            if (activeChildWindows.length > 0) {
                const prevLen = activeChildWindows.length;
                activeChildWindows = activeChildWindows.filter(w => w && !w.closed);
                if (activeChildWindows.length !== prevLen) {
                    updateCastStatusUI();
                }
            }
        }, 3000);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initDisplayManager);
    } else {
        window.initDisplayManager();
    }
})();
