(() => {
    const fallbackNames = ["경배/찬양", "잔잔/묵상", "기도/회개", "결단/헌금", "웅장/선포", "절기/특별", "기본/일반"];
    window.moodTags = fallbackNames.map((name, index) => ({ id: index === 6 ? "default" : `fallback-${index}`, name, aliases: [], locked: index === 6, usage: { songs: 0, backgrounds: 0, slides: 0 } }));

    window.canonicalMoodTag = value => {
        const key = String(value || "기본/일반").replace(/^#/, "").trim().normalize("NFKC").toLocaleLowerCase();
        const match = window.moodTags.find(tag => [tag.name, ...(tag.aliases || [])].some(name => String(name).normalize("NFKC").toLocaleLowerCase() === key));
        return match ? match.name : String(value || "기본/일반").replace(/^#/, "").trim();
    };

    async function refreshMoodTags(notify = true) {
        const response = await fetch("/api/tags");
        if (!response.ok) throw new Error("태그 목록을 불러오지 못했습니다.");
        window.moodTags = await response.json();
        if (notify) document.dispatchEvent(new CustomEvent("mood-tags-updated"));
        renderManagerList();
        return window.moodTags;
    }
    window.refreshMoodTags = refreshMoodTags;

    const manager = () => document.getElementById("mood-tag-manager-modal");
    const list = () => document.getElementById("mood-tag-manager-list");

    function renderManagerList() {
        const container = list();
        if (!container) return;
        container.replaceChildren();
        for (const tag of window.moodTags) {
            const row = document.createElement("div");
            row.className = "mood-tag-row";
            const name = document.createElement("span");
            name.textContent = `#${tag.name}`;
            name.className = "mood-tag-name";
            row.append(name);
            const usage = tag.usage || {};
            const count = document.createElement("span");
            count.textContent = `찬양 ${usage.songs || 0} · 배경 ${usage.backgrounds || 0} · 슬라이드 ${usage.slides || 0}`;
            count.className = "mood-tag-usage";
            row.append(count);

            if (!tag.locked) {
                const rename = document.createElement("button");
                rename.type = "button";
                rename.textContent = "이름 변경";
                rename.className = "btn-template-action mood-tag-action";
                rename.onclick = async () => {
                    const nextName = prompt("새 태그 이름을 입력하세요.", tag.name);
                    if (nextName === null || !nextName.trim()) return;
                    await mutate(`/api/tags/${encodeURIComponent(tag.id)}`, "PATCH", { name: nextName });
                };
                const remove = document.createElement("button");
                remove.type = "button";
                remove.textContent = "삭제";
                remove.className = "btn-template-action mood-tag-action";
                remove.style.color = "#fca5a5";
                remove.onclick = async () => {
                    const total = (usage.songs || 0) + (usage.backgrounds || 0) + (usage.slides || 0);
                    const detail = total ? `\n\n찬양 ${usage.songs || 0}곡, 배경 ${usage.backgrounds || 0}개, 슬라이드 ${usage.slides || 0}개가 기본/일반 태그로 변경됩니다.` : "";
                    if (!confirm(`‘${tag.name}’ 태그를 삭제할까요?${detail}`)) return;
                    await mutate(`/api/tags/${encodeURIComponent(tag.id)}`, "DELETE");
                };
                row.append(rename, remove);
            } else {
                const fixed = document.createElement("span");
                fixed.textContent = "기본 태그";
                fixed.className = "mood-tag-fixed";
                row.append(fixed);
            }
            container.append(row);
        }
    }

    async function mutate(url, method, body) {
        try {
            const response = await fetch(url, {
                method,
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "태그를 저장하지 못했습니다.");
            await refreshMoodTags();
            if (typeof showToast === "function") showToast("태그 목록을 저장했습니다.");
        } catch (error) {
            alert(error.message);
        }
    }

    window.openMoodTagManager = async () => {
        try {
            await refreshMoodTags(false);
            if (manager()) manager().style.display = "flex";
        } catch (error) {
            alert(error.message);
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".btn-open-tag-manager").forEach(button => button.addEventListener("click", window.openMoodTagManager));
        const modal = manager();
        document.getElementById("btn-close-tag-manager")?.addEventListener("click", () => { modal.style.display = "none"; });
        modal?.addEventListener("click", event => { if (event.target === modal) modal.style.display = "none"; });
        const input = document.getElementById("input-new-mood-tag");
        const addButton = document.getElementById("btn-add-mood-tag");
        const addTag = async () => {
            const name = input?.value.trim();
            if (!name) return;
            await mutate("/api/tags", "POST", { name });
            if (input) input.value = "";
        };
        addButton?.addEventListener("click", addTag);
        input?.addEventListener("keydown", event => { if (event.key === "Enter") addTag(); });
        refreshMoodTags().catch(error => console.error("Failed to load mood tags", error));
    });
})();
