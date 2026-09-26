import pytest

from backend.services import tag_service


def test_tag_rename_and_delete_keep_existing_names_resolvable(monkeypatch, tmp_path):
    registry_file = tmp_path / "mood_tags.json"
    monkeypatch.setattr(tag_service, "TAG_FILE", registry_file)
    monkeypatch.setattr(tag_service, "_TAG_CACHE", None)
    monkeypatch.setattr(tag_service, "_TAG_CACHE_MTIME_NS", None)

    created = tag_service.create_tag("새 태그")
    tag_service.rename_tag(created["id"], "변경 태그")

    assert tag_service.canonical_tag_name("새 태그") == "변경 태그"
    assert tag_service.canonical_tag_name("변경 태그") == "변경 태그"

    removed = tag_service.delete_tag(created["id"])
    assert removed["default_tag"] == "기본/일반"
    assert tag_service.canonical_tag_name("새 태그") == "기본/일반"
    assert tag_service.canonical_tag_name("변경 태그") == "기본/일반"

    with pytest.raises(ValueError):
        tag_service.rename_tag("default", "다른 기본")
    with pytest.raises(ValueError):
        tag_service.delete_tag("default")
