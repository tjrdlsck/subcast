/**
 * editor-display-manager.js
 * Subcast 멀티 모니터 자동 분할 송출 (Multi-Screen Window Placement) 전담 모듈
 * 
 * - 최신 Window Management API를 활용하여 연결된 물리적 디스플레이 자동 감지
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

    // 모달 DOM 동적 생성 (어느 페이지에서나 모달이 없으면 자동 주입)
    function ensureModalExists() {
        let modal = document.getElementById('modal-display-manager');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modal-display-manager';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 99999; align-items: center; justify-content: center;';
        
        modal.innerHTML = `
            <div class="modal-content" style="width: 580px; max-width: 92vw; background: #111827; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); color: #fff; font-family: 'Inter', sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
                    <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: #f3f4f6; letter-spacing: -0.3px;">
                        멀티 디스플레이 송출 설정
                    </h3>
                    <span id="btn-display-modal-close" style="cursor: pointer; font-size: 1.4rem; color: #9ca3af; line-height: 1; padding: 4px 8px;">&times;</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <div style="font-size: 0.8rem; color: #9ca3af; display: flex; justify-content: space-between; align-items: center;">
                        <span>각 모니터에 송출할 화면을 선택해 주세요.</span>
                        <span id="display-status-notice" style="color: #60a5fa; font-weight: 600;"></span>
                    </div>

                    <div id="display-cards-list" style="max-height: 320px; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 10px;">
                        <!-- 동적 카드 목록 -->
                    </div>

                    <div style="background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.15); border-radius: 6px; padding: 10px 14px; font-size: 0.76rem; color: #9ca3af; line-height: 1.45;">
                        <strong>안내:</strong> 여러 모니터에 동일한 화면(예: 현장 뷰어)을 중복 지정할 수 있습니다. 1번 주 화면은 <code>[미사용] 띄우지 않음</code>으로 두는 것을 권장합니다.
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 14px;">
                    <button type="button" id="btn-display-stop-cast" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 8px 16px; font-size: 0.82rem; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s;">모든 송출 창 닫기</button>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" id="btn-display-start-cast" style="background: #2563eb; color: white; padding: 8px 20px; font-size: 0.82rem; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s;">일괄 송출 시작</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 내부 닫기 및 액션 버튼 이벤트 바인딩
        modal.querySelector('#btn-display-modal-close').onclick = closeDisplayModal;
        modal.querySelector('#btn-display-start-cast').onclick = startMultiScreenCast;
        modal.querySelector('#btn-display-stop-cast').onclick = () => {
            closeAllCastWindows();
            closeDisplayModal();
        };

        // 바깥 배경 클릭 시 닫기
        modal.onclick = (e) => {
            if (e.target === modal) closeDisplayModal();
        };

        return modal;
    }

    // 모달 열기 (0초 즉시 반응)
    window.openDisplayModal = function () {
        console.log('[DisplayManager] openDisplayModal 호출됨');
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

        // 백그라운드 멀티 모니터 탐색
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
                console.warn('[DisplayManager] getScreenDetails 예외 (Fallback 유지):', err);
            }
        }
    }

    // 카드 목록 렌더링
    function renderScreenCards(screens) {
        const listContainer = document.getElementById('display-cards-list');
        const statusNotice = document.getElementById('display-status-notice');
        if (!listContainer) return;

        const savedConfig = loadSavedConfig();
        const mappings = savedConfig.mappings || [];

        if (statusNotice) {
            statusNotice.innerText = `총 ${screens.length}개 디스플레이 감지됨`;
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
            card.className = 'display-slot-card';
            card.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid ${isPrimary ? '#3b82f6' : 'rgba(255,255,255,0.1)'};
                border-radius: 8px;
                padding: 12px 16px;
                gap: 14px;
            `;

            card.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                    <div style="font-weight: 600; font-size: 0.9rem; color: #f3f4f6; display: flex; align-items: center; gap: 8px;">
                        <span>${labelText}</span>
                        ${isPrimary ? '<span style="font-size: 0.7rem; background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: 500;">주 화면</span>' : ''}
                    </div>
                    <div style="font-size: 0.76rem; color: #9ca3af;">
                        해상도: ${resText} | 좌표: (${screen.availLeft || 0}, ${screen.availTop || 0})
                    </div>
                </div>
                <div style="min-width: 210px;">
                    <select class="display-select-view" data-screen-index="${idx}" style="
                        width: 100%;
                        padding: 7px 10px;
                        background: #1f2937;
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px;
                        color: #f3f4f6;
                        font-size: 0.82rem;
                        cursor: pointer;
                        outline: none;
                    ">
                        ${Object.entries(VIEW_DEFINITIONS).map(([key, def]) => `
                            <option value="${key}" ${currentView === key ? 'selected' : ''}>${def.label}</option>
                        `).join('')}
                    </select>
                </div>
            `;

            listContainer.appendChild(card);
        });

        // 드롭다운 변경 시 즉시 설정 저장
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
                btn.innerHTML = `<span style="background:#22c55e; width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:6px; box-shadow:0 0 6px #22c55e;"></span>송출 중 (${activeCount})`;
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
