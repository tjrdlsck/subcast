import json
import logging
import uuid
import asyncio
import re
from fastapi import WebSocket, WebSocketDisconnect

from backend.schemas import Slide, SlideTemplate, Element, CustomFont, ProjectData
from backend.storage import save_project_data, save_global_templates, load_global_templates
from backend.services.connection_manager import manager
from backend.services.background_service import backgrounds_dir, load_bg_meta, save_bg_meta
from backend.services.mood_matching import extract_normalized_tags, normalize_tag, select_stage_background
from backend.services.tag_service import canonicalize_item, canonical_tag_name

logger = logging.getLogger("subcast")

stage_bg_history_queue = []
song_stage_bg_cache = {}

_STAGE_BG_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".jpg", ".png"}
_PRAISE_SLIDE_NAME = re.compile(r"^(?P<kind>찬양:|자막\(템\):|자막:)\s*(?P<title>.+?)\s+\((?P<number>\d+)/(?P<total>\d+)\)(?:\s+\[[^]]+\])?(?P<copy>(?:\s+\(사본\))*)$")


def _available_stage_backgrounds(project_library: list[dict]) -> list[dict]:
    """Return only videos and images that are present on disk."""
    available = {
        path.name for path in backgrounds_dir.iterdir()
        if path.is_file() and path.suffix.lower() in _STAGE_BG_EXTENSIONS
        and not path.name.startswith((".trash_", ".chunk_"))
    }
    meta = load_bg_meta()
    library = []
    known_names = set()
    for item in project_library:
        name = item.get("name")
        if name in available:
            item_meta = meta.get(name, {})
            merged = canonicalize_item(item)
            if not item_meta.get("mood") and not item_meta.get("moods") and merged.get("mood") == "기본/일반":
                merged.pop("mood", None)
                merged.pop("moods", None)
            for field in ("mood", "moods", "isDefault"):
                if field not in merged or merged[field] in (None, "", []):
                    if field in item_meta:
                        merged[field] = item_meta[field]
            library.append({**merged, "url": f"/static/backgrounds/{name}"})
            known_names.add(name)
    for name in sorted(available - known_names):
        item_meta = meta.get(name, {})
        tag_data = canonicalize_item({
            "mood": item_meta.get("mood"),
            "moods": item_meta.get("moods", [item_meta["mood"]] if item_meta.get("mood") else []),
        })
        library.append({
            "name": name,
            "url": f"/static/backgrounds/{name}",
            **tag_data,
            "isDefault": item_meta.get("isDefault", False),
        })
    return library


def _cached_background_matches_moods(
    background: dict, slide_moods: list[str] | str | None, bg_library: list[dict]
) -> bool:
    """Keep automatic song background choices only while they remain eligible."""
    target_tags = extract_normalized_tags(slide_moods)
    default_tag = normalize_tag(canonical_tag_name("기본/일반"))

    def background_tags(item: dict) -> list[str]:
        values = [item.get("mood"), item.get("tag")]
        moods = item.get("moods")
        if isinstance(moods, list):
            values.extend(moods)
        elif isinstance(moods, str):
            values.append(moods)
        return extract_normalized_tags(values)

    tagged_matches = [
        item for item in bg_library
        if target_tags and set(target_tags).intersection(background_tags(item))
    ]
    if tagged_matches:
        return background in tagged_matches

    default_matches = [
        item for item in bg_library
        if item.get("isDefault") or item.get("is_default")
        or normalize_tag(item.get("mood")) == default_tag
        or default_tag in background_tags(item)
    ]
    return background in default_matches


def _should_reuse_cached_background(
    background: dict | None,
    is_explicit: bool,
    has_slide_tag_override: bool,
    slide_moods: list[str] | str | None,
    bg_library: list[dict],
) -> bool:
    if not background:
        return False
    if is_explicit and not has_slide_tag_override:
        return True
    return _cached_background_matches_moods(background, slide_moods, bg_library)


def _slide_background_moods(slide: Slide | None, fallback: list[str] | str | None) -> list[str] | str | None:
    """Resolve a slide-specific background tag before its existing song/slide tags."""
    if slide and slide.stageBgMoodOverride:
        return [canonical_tag_name(slide.stageBgMoodOverride)]
    slide_moods = (slide.moods or ([slide.mood] if slide.mood else [])) if slide else fallback
    if isinstance(slide_moods, list):
        return [canonical_tag_name(tag) for tag in slide_moods]
    if slide_moods:
        return canonical_tag_name(slide_moods)
    return slide_moods


def _legacy_praise_group_key(slide_id: str, slides: list[Slide]) -> str | None:
    """Find the first numbered verse, even when unrelated slides were inserted."""
    index = next((i for i, slide in enumerate(slides) if slide.id == slide_id), None)
    if index is None:
        return None
    match = _PRAISE_SLIDE_NAME.match(slides[index].name)
    if not match:
        return None
    label = (match["kind"], match["title"].strip(), match["total"], match["copy"])
    expected = int(match["number"]) - 1
    while expected > 0:
        found = False
        for candidate_index in range(index - 1, -1, -1):
            candidate = _PRAISE_SLIDE_NAME.match(slides[candidate_index].name)
            if not candidate or (candidate["kind"], candidate["title"].strip(), candidate["total"], candidate["copy"]) != label:
                continue
            number = int(candidate["number"])
            if number == expected:
                index = candidate_index
                expected -= 1
                found = True
            break
        if not found:
            break
    return f"legacy:{slides[index].id}"

_pending_save_tasks = {}

async def _debounced_save_project(delay: float = 0.5):
    """지정된 시간(기본 0.5초) 동안 추가 변경이 없을 때 최신 프로젝트 데이터를 저장합니다."""
    try:
        await asyncio.sleep(delay)
        if manager.project_data:
            await save_project_data(manager.project_data)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Error in debounced save_project_data: {e}", exc_info=True)

def schedule_debounced_save(delay: float = 0.5):
    """기존 대기 중인 저장 태스크를 취소하고 새 지연 저장 태스크를 예약합니다."""
    task = _pending_save_tasks.get("project")
    if task and not task.done():
        task.cancel()
    _pending_save_tasks["project"] = asyncio.create_task(_debounced_save_project(delay))


async def handle_websocket_session(websocket: WebSocket, role: str):
    await manager.connect(websocket, role)
    ws_id = str(id(websocket))
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            
            if msg_type == "SLIDE_CHANGE":
                new_slide_id = message.get("slideId")
                if manager.project_data and manager.project_data.settings:
                    manager.project_data.settings.currentLiveSlideId = new_slide_id
                    schedule_debounced_save(0.5)
                
                await manager.broadcast({
                    "type": "SLIDE_CHANGE",
                    "slideId": new_slide_id
                })
                logger.info(f"Live slide changed to: {new_slide_id}")

            elif msg_type == "SET_STAGE_BACKGROUND":
                bg_data = message.get("background", {})
                if manager.project_data and manager.project_data.settings:
                    setattr(manager.project_data.settings, "stageBackground", bg_data)
                    await save_project_data(manager.project_data)
                
                await manager.broadcast({
                    "type": "SET_STAGE_BACKGROUND",
                    "background": bg_data
                })
                logger.info(f"Stage background updated: {bg_data.get('type')}")

            elif msg_type == "SELECT_STAGE_BACKGROUND_BY_MOOD":
                slide_id = message.get("slideId")
                slides = manager.project_data.slides if manager.project_data else []
                slide = next((item for item in slides if item.id == slide_id), None)
                slide_moods = _slide_background_moods(slide, message.get("slideMoods", []))
                override_bg_id = slide.overrideBgId if slide else message.get("overrideBgId")
                praise_group_id = slide.praiseGroupId if slide else message.get("praiseGroupId")
                song_title = slide.songTitle if slide else message.get("songTitle")
                legacy_key = _legacy_praise_group_key(slide_id, slides) if slide_id and slide else None
                first_legacy_slide = next((item for item in slides if legacy_key == f"legacy:{item.id}"), None)
                song_key = (first_legacy_slide.praiseGroupId if first_legacy_slide else None) or praise_group_id or legacy_key or song_title
                if song_key and manager.project_data:
                    song_key = f"{manager.project_data.id}:{song_key}"

                project_library = getattr(manager.project_data.settings, "stageBgLibrary", None) if manager.project_data and manager.project_data.settings else None
                bg_library = _available_stage_backgrounds(project_library or [])
                
                has_explicit_override = bool(override_bg_id and any(
                    bg.get("id") == override_bg_id or bg.get("name") == override_bg_id
                    for bg in bg_library
                ))
                reused_explicit_cache = False
                if not override_bg_id and song_key and song_key in song_stage_bg_cache:
                    cached_entry = song_stage_bg_cache[song_key]
                    cached_bg_id = cached_entry.get("id") if isinstance(cached_entry, dict) else cached_entry
                    cached_bg = next((
                        bg for bg in bg_library
                        if bg.get("id") == cached_bg_id or bg.get("name") == cached_bg_id
                    ), None)
                    cached_is_explicit = isinstance(cached_entry, dict) and cached_entry.get("explicit") is True
                    if _should_reuse_cached_background(
                        cached_bg,
                        cached_is_explicit,
                        bool(slide and slide.stageBgMoodOverride),
                        slide_moods,
                        bg_library,
                    ):
                        override_bg_id = cached_bg_id
                        reused_explicit_cache = cached_is_explicit

                missing_bg_id = override_bg_id if override_bg_id and not any(
                    bg.get("id") == override_bg_id or bg.get("name") == override_bg_id for bg in bg_library
                ) else None

                bg_data = select_stage_background(
                    slide_moods=slide_moods,
                    override_bg_id=override_bg_id,
                    bg_library=bg_library,
                    history_queue=stage_bg_history_queue
                )
                if missing_bg_id:
                    await websocket.send_text(json.dumps({
                        "type": "STAGE_BACKGROUND_MISSING",
                        "backgroundId": missing_bg_id,
                        "fallbackType": bg_data.get("type")
                    }))
                
                if song_key and bg_data.get("id"):
                    song_stage_bg_cache[song_key] = {
                        "id": bg_data.get("id"),
                        "explicit": has_explicit_override or reused_explicit_cache,
                    }
                
                if manager.project_data and manager.project_data.settings:
                    setattr(manager.project_data.settings, "stageBackground", bg_data)
                    await save_project_data(manager.project_data)
                    
                await manager.broadcast({
                    "type": "SET_STAGE_BACKGROUND",
                    "background": bg_data
                })
                logger.info(f"Stage background automatically matched by mood: {bg_data.get('type')}")

            elif msg_type == "UPDATE_STAGE_BG_LIBRARY":
                library_data = message.get("library", [])
                request_id = message.get("requestId")
                settings = manager.project_data.settings if manager.project_data else None
                previous_library = getattr(settings, "stageBgLibrary", None) if settings else None
                try:
                    if not isinstance(library_data, list):
                        raise ValueError("배경 라이브러리 형식이 올바르지 않습니다.")
                    if manager.project_data and manager.project_data.settings:
                        setattr(manager.project_data.settings, "stageBgLibrary", library_data)
                        await save_project_data(manager.project_data)

                    meta = load_bg_meta()
                    for item in library_data:
                        name = item.get("name") if isinstance(item, dict) else None
                        if name:
                            if name not in meta:
                                meta[name] = {}
                            for field in ("mood", "moods", "isDefault"):
                                if field in item:
                                    meta[name][field] = item[field]
                    if not save_bg_meta(meta):
                        raise OSError("배경 태그 메타데이터를 저장하지 못했습니다.")
                    await websocket.send_text(json.dumps({
                        "type": "STAGE_BG_LIBRARY_SAVE_RESULT",
                        "requestId": request_id,
                        "success": True,
                    }))
                    logger.info(f"Stage background library updated: {len(library_data)} items")
                except Exception as e:
                    if settings:
                        setattr(settings, "stageBgLibrary", previous_library)
                        try:
                            await save_project_data(manager.project_data)
                        except Exception:
                            logger.exception("Failed to roll back stage background library")
                    logger.exception("Failed to save stage background library")
                    await websocket.send_text(json.dumps({
                        "type": "STAGE_BG_LIBRARY_SAVE_RESULT",
                        "requestId": request_id,
                        "success": False,
                        "error": str(e),
                    }))

            elif msg_type == "UPDATE_PRAISE_BROADCAST_LAYOUT":
                layout_data = message.get("layout", {})
                if manager.project_data and manager.project_data.settings:
                    manager.project_data.settings.praiseBroadcastLayout = layout_data
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "PRAISE_BROADCAST_LAYOUT_UPDATED",
                        "layout": layout_data
                    })
                    logger.info("Praise broadcast layout saved and broadcasted to all clients.")

            elif msg_type == "UPDATE_RESOLUTION":
                width = message.get("width")
                height = message.get("height")
                if width and height and manager.project_data and manager.project_data.settings:
                    manager.project_data.settings.targetWidth = int(width)
                    manager.project_data.settings.targetHeight = int(height)
                    await save_project_data(manager.project_data)
                    
                    await manager.broadcast({
                        "type": "UPDATE_RESOLUTION",
                        "width": width,
                        "height": height
                    })
                    logger.info(f"Resolution updated: {width}x{height}")

            elif msg_type == "UPDATE_STAGE_RESOLUTION":
                width = message.get("width")
                height = message.get("height")
                if width and height and manager.project_data and manager.project_data.settings:
                    if not hasattr(manager.project_data.settings, 'stageTargetWidth'):
                        setattr(manager.project_data.settings, 'stageTargetWidth', int(width))
                        setattr(manager.project_data.settings, 'stageTargetHeight', int(height))
                    else:
                        manager.project_data.settings.stageTargetWidth = int(width)
                        manager.project_data.settings.stageTargetHeight = int(height)
                    await save_project_data(manager.project_data)
                    
                    await manager.broadcast({
                        "type": "UPDATE_STAGE_RESOLUTION",
                        "width": width,
                        "height": height
                    })
                    logger.info(f"Stage resolution updated: {width}x{height}")

            elif msg_type == "LOCK_SLIDE":
                slide_id = message.get("slideId")
                editor_name = message.get("editorName", "편집자")
                
                if slide_id in manager.locked_slides and manager.locked_slides[slide_id] != ws_id:
                    await websocket.send_text(json.dumps({
                        "type": "LOCK_FAILED",
                        "slideId": slide_id,
                        "reason": "다른 편집자가 편집 중입니다."
                    }))
                else:
                    manager.locked_slides[slide_id] = ws_id
                    await manager.broadcast({
                        "type": "SLIDE_LOCKED",
                        "slideId": slide_id,
                        "ownerId": ws_id,
                        "editorName": editor_name
                    })
                    logger.info(f"Slide locked: {slide_id} by {editor_name}")

            elif msg_type == "UNLOCK_SLIDE":
                slide_id = message.get("slideId")
                if slide_id in manager.locked_slides and manager.locked_slides[slide_id] == ws_id:
                    del manager.locked_slides[slide_id]
                    await manager.broadcast({
                        "type": "SLIDE_UNLOCKED",
                        "slideId": slide_id
                    })
                    logger.info(f"Slide unlocked: {slide_id}")

            elif msg_type == "ADD_SLIDE":
                new_id = f"slide_{uuid.uuid4().hex[:8]}"
                slide_num = len(manager.project_data.slides) + 1 if manager.project_data else 1
                new_slide = Slide(id=new_id, name=f"새 슬라이드 {slide_num}", elements=[])
                
                after_slide_id = message.get("afterSlideId")
                insert_idx = -1
                if after_slide_id and manager.project_data:
                    for idx, s in enumerate(manager.project_data.slides):
                        if s.id == after_slide_id:
                            insert_idx = idx + 1
                            break
                            
                if manager.project_data:
                    if insert_idx != -1:
                        manager.project_data.slides.insert(insert_idx, new_slide)
                    else:
                        manager.project_data.slides.append(new_slide)
                        
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                logger.info(f"New slide added: {new_id}")

            elif msg_type == "SAVE_TEMPLATE":
                tpl_data = message.get("template")
                if tpl_data and manager.project_data:
                    new_tpl = SlideTemplate.model_validate(tpl_data)
                    for idx, t in enumerate(manager.project_data.templates):
                        if t.id == new_tpl.id:
                            manager.project_data.templates[idx] = new_tpl
                            break
                    else:
                        manager.project_data.templates.append(new_tpl)
                    await save_global_templates(manager.project_data.templates)
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Template saved globally: {new_tpl.id}")

            elif msg_type == "DELETE_TEMPLATE":
                tpl_id = message.get("templateId")
                tpl_ids = message.get("templateIds")
                if manager.project_data:
                    if tpl_ids:
                        manager.project_data.templates = [t for t in manager.project_data.templates if t.id not in tpl_ids]
                    elif tpl_id:
                        manager.project_data.templates = [t for t in manager.project_data.templates if t.id != tpl_id]
                    await save_global_templates(manager.project_data.templates)
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Template(s) deleted: {tpl_ids or tpl_id}")

            elif msg_type == "APPLY_TEMPLATE_BULK":
                slide_ids = message.get("slideIds", [])
                template_id = message.get("templateId")
                if manager.project_data:
                    target_tpl = next((t for t in manager.project_data.templates if t.id == template_id), None)
                    if target_tpl and slide_ids:
                        manager.push_history()

                        def find_longest_text_element_id(elems):
                            longest_id = None
                            longest_len = -1
                            def traverse(el_list):
                                nonlocal longest_id, longest_len
                                for el in el_list:
                                    if el.type == "text":
                                        content_len = len(el.content or "")
                                        if content_len > longest_len:
                                            longest_len = content_len
                                            longest_id = el.id
                                    elif el.type == "group" and el.children:
                                        traverse(el.children)
                            traverse(elems)
                            return longest_id

                        target_element_id = message.get("targetElementId")
                        if target_element_id:
                            tpl_longest_id = target_element_id
                        else:
                            tpl_longest_id = find_longest_text_element_id(target_tpl.elements)

                        for idx, s in enumerate(manager.project_data.slides):
                            if s.id in slide_ids:
                                orig_longest_text = ""
                                orig_longest_len = -1
                                def traverse_orig(el_list):
                                    nonlocal orig_longest_text, orig_longest_len
                                    for el in el_list:
                                        if el.type == "text":
                                            content_len = len(el.content or "")
                                            if content_len > orig_longest_len:
                                                orig_longest_len = content_len
                                                orig_longest_text = el.content or ""
                                        elif el.type == "group" and el.children:
                                            traverse_orig(el.children)
                                traverse_orig(s.elements)

                                def clone_elements(elems):
                                    cloned = []
                                    for el in elems:
                                        el_dict = el.model_dump()
                                        orig_el_id = el.id
                                        el_dict["id"] = f"elem_{uuid.uuid4().hex[:9]}"
                                        if el.type == "text" and orig_el_id == tpl_longest_id:
                                            el_dict["content"] = orig_longest_text
                                        if "children" in el_dict and el_dict["children"]:
                                            el_dict["children"] = clone_elements(el.children)
                                        cloned.append(Element.model_validate(el_dict))
                                    return cloned

                                manager.project_data.slides[idx].elements = clone_elements(target_tpl.elements)
                                manager.project_data.slides[idx].thumbnail = None

                        await save_project_data(manager.project_data)
                        await manager.broadcast({
                            "type": "INITIAL_SYNC",
                            "data": manager.project_data.model_dump(),
                            "lockedSlides": manager.locked_slides
                        })

            elif msg_type == "ADD_CUSTOM_FONT":
                family = message.get("family")
                url = message.get("url")
                orig_css = message.get("originalCssCode")
                
                if family and url and manager.project_data:
                    import os
                    import httpx
                    import urllib.parse
                    import hashlib
                    import re
                    
                    fonts_dir = os.path.join("frontend", "fonts")
                    os.makedirs(fonts_dir, exist_ok=True)
                    
                    parsed_url = urllib.parse.urlparse(url)
                    orig_filename = os.path.basename(parsed_url.path)
                    ext = os.path.splitext(orig_filename)[1] or ".woff2"
                    
                    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()[:8]
                    safe_family = "".join([c for c in family if c.isalnum() or c in ("-", "_")])
                    filename = f"{safe_family}_{url_hash}{ext}"
                    filepath = os.path.join(fonts_dir, filename)
                    local_url = f"/static/fonts/{filename}"
                    
                    download_success = True
                    if not os.path.exists(filepath):
                        try:
                            logger.info(f"Downloading custom font: {url} -> {filepath}")
                            async with httpx.AsyncClient() as client:
                                response = await client.get(url, timeout=15.0)
                                if response.status_code == 200:
                                    with open(filepath, "wb") as f:
                                        f.write(response.content)
                                else:
                                    logger.error(f"Failed to download font: status {response.status_code}")
                                    download_success = False
                        except Exception as e:
                            logger.error(f"Error downloading font: {e}")
                            download_success = False
                    
                    if download_success:
                        local_css = re.sub(r'url\s*\(\s*[\'"]?([^\'")]+)[\'"]?\s*\)', f"url('{local_url}')", orig_css)
                        new_font = CustomFont(family=family, cssCode=local_css)
                        
                        for idx, f in enumerate(manager.project_data.customFonts):
                            if f.family.lower() == family.lower():
                                manager.project_data.customFonts[idx] = new_font
                                break
                        else:
                            manager.project_data.customFonts.append(new_font)
                            
                        await save_project_data(manager.project_data)
                        await manager.broadcast({
                            "type": "INITIAL_SYNC",
                            "data": manager.project_data.model_dump(),
                            "lockedSlides": manager.locked_slides
                        })
                        logger.info(f"Custom font registered: {family} -> {local_url}")

            elif msg_type == "UNDO_BULK_ACTION":
                if manager.project_history:
                    prev_state = manager.project_history.pop()
                    manager.project_data = ProjectData.model_validate(prev_state)
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info("Bulk action undone successfully.")

            elif msg_type == "REORDER_SLIDES":
                slide_ids = message.get("slideIds", [])
                if slide_ids and manager.project_data:
                    slide_map = {s.id: s for s in manager.project_data.slides}
                    new_slides = [slide_map[sid] for sid in slide_ids if sid in slide_map]
                    for s in manager.project_data.slides:
                        if s.id not in slide_ids:
                            new_slides.append(s)
                    manager.project_data.slides = new_slides
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info("Slides reordered and synchronized.")

            elif msg_type == "DELETE_SLIDES":
                slide_ids = message.get("slideIds", [])
                if slide_ids and manager.project_data:
                    manager.project_data.slides = [s for s in manager.project_data.slides if s.id not in slide_ids]
                    if not manager.project_data.slides:
                        new_id = f"slide_{uuid.uuid4().hex[:8]}"
                        new_slide = Slide(id=new_id, name="새 슬라이드 1", elements=[])
                        manager.project_data.slides.append(new_slide)
                    
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Slides deleted: {slide_ids}")

            elif msg_type == "ADD_SLIDES_BULK":
                slides_data = message.get("slides", [])
                insert_after_id = message.get("insertAfterId")
                if slides_data and manager.project_data:
                    new_slides = [Slide.model_validate(s_data) for s_data in slides_data]
                    
                    insert_idx = -1
                    if insert_after_id:
                        for idx, s in enumerate(manager.project_data.slides):
                            if s.id == insert_after_id:
                                insert_idx = idx
                                break
                                
                    if insert_idx != -1:
                        manager.project_data.slides = (
                            manager.project_data.slides[:insert_idx + 1] + 
                            new_slides + 
                            manager.project_data.slides[insert_idx + 1:]
                        )
                    else:
                        manager.project_data.slides.extend(new_slides)
                        
                    await save_project_data(manager.project_data)
                    await manager.broadcast({
                        "type": "INITIAL_SYNC",
                        "data": manager.project_data.model_dump(),
                        "lockedSlides": manager.locked_slides
                    })
                    logger.info(f"Bulk slides added: {len(slides_data)} slides")

            elif msg_type == "SAVE_SLIDES_BULK":
                slides_data = message.get("slides", [])
                if slides_data and manager.project_data:
                    updated = {slide.id: slide for slide in (Slide.model_validate(data) for data in slides_data)}
                    for index, existing in enumerate(manager.project_data.slides):
                        if existing.id in updated:
                            manager.project_data.slides[index] = updated[existing.id]
                    await save_project_data(manager.project_data)
                    for slide in updated.values():
                        await manager.broadcast({
                            "type": "SLIDE_UPDATED",
                            "slideId": slide.id,
                            "slide": slide.model_dump(),
                            "isLive": slide.id == manager.project_data.settings.currentLiveSlideId,
                        })

            elif msg_type == "SAVE_SLIDE":
                request_id = message.get("requestId")
                has_request_id = isinstance(request_id, str)
                slide_data = message.get("slide")
                if not slide_data or not manager.project_data:
                    if has_request_id:
                        await websocket.send_json({
                            "type": "SAVE_SLIDE_RESULT", "requestId": request_id,
                            "success": False, "reason": "Slide could not be saved."
                        })
                    continue

                slides = manager.project_data.slides
                slide_index = None
                previous_slide = None
                updated_slide = None
                try:
                    updated_slide = Slide.model_validate(slide_data)
                    slide_id = updated_slide.id
                    for idx, s in enumerate(slides):
                        if s.id == slide_id:
                            slide_index = idx
                            previous_slide = s
                            slides[idx] = updated_slide
                            break
                    else:
                        slide_index = len(slides)
                        slides.append(updated_slide)

                    await save_project_data(manager.project_data)
                except Exception:
                    # Do not overwrite a newer edit that arrived during persistence.
                    if slide_index is not None and slide_index < len(slides) and slides[slide_index] is updated_slide:
                        if previous_slide is None:
                            slides.pop(slide_index)
                        else:
                            slides[slide_index] = previous_slide
                    if not has_request_id:
                        raise
                    logger.exception("Slide save failed for request %s", request_id)
                    await websocket.send_json({
                        "type": "SAVE_SLIDE_RESULT", "requestId": request_id,
                        "success": False, "reason": "Slide could not be saved."
                    })
                    continue
                logger.info(f"Slide {slide_id} saved.")

                live_slide_id = manager.project_data.settings.currentLiveSlideId if manager.project_data.settings else None
                
                if slide_id == live_slide_id:
                    await manager.broadcast({
                        "type": "SLIDE_UPDATED",
                        "slideId": slide_id,
                        "slide": slide_data,
                        "isLive": True
                    })
                    logger.info(f"Live slide updated: {slide_id}")
                else:
                    await manager.broadcast({
                        "type": "SLIDE_UPDATED",
                        "slideId": slide_id,
                        "slide": slide_data,
                        "isLive": False
                    }, role="presenter")
                    
                    await manager.broadcast({
                        "type": "SLIDE_UPDATED",
                        "slideId": slide_id,
                        "slide": slide_data,
                        "isLive": False
                    }, role="editor")

                if has_request_id:
                    await websocket.send_json({
                        "type": "SAVE_SLIDE_RESULT", "requestId": request_id,
                        "success": True
                    })

    except WebSocketDisconnect:
        released_slides = manager.disconnect(websocket, role)
        for slide_id in released_slides:
            await manager.broadcast({
                "type": "SLIDE_UNLOCKED",
                "slideId": slide_id
            })
            logger.info(f"Auto-unlocked slide {slide_id} on client disconnect")
            
    except Exception as e:
        logger.error(f"WebSocket error in {role}: {e}")
        released_slides = manager.disconnect(websocket, role)
        for slide_id in released_slides:
            await manager.broadcast({
                "type": "SLIDE_UNLOCKED",
                "slideId": slide_id
            })
