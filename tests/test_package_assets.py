"""Package asset allowlist and user-data upgrade preservation checks."""

import json
import runpy
import shutil
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OAUTH_FILE = "client_secret_131602755526-k80ot6sq10ttqhos02vho3vuemj7khia.apps.googleusercontent.com.json"


class _BuildNode:
    pure = []
    zipped_data = []
    scripts = []
    binaries = []
    zipfiles = []
    datas = []


def _capture_spec_datas(monkeypatch, workspace: Path, oauth_present: bool = False):
    captured = {}
    original_is_file = Path.is_file

    def fixture_is_file(path):
        if path.name == OAUTH_FILE:
            return oauth_present
        return original_is_file(path)

    monkeypatch.setattr(Path, "is_file", fixture_is_file)

    def analysis(*args, **kwargs):
        captured["datas"] = list(kwargs["datas"])
        return _BuildNode()

    monkeypatch.chdir(workspace)
    namespace = {
        "__file__": str(workspace / "subcast.spec"),
        "Analysis": analysis,
        "PYZ": lambda *args, **kwargs: _BuildNode(),
        "EXE": lambda *args, **kwargs: _BuildNode(),
        "COLLECT": lambda *args, **kwargs: _BuildNode(),
    }
    source = (ROOT / "subcast.spec").read_text(encoding="utf-8")
    exec(compile(source, str(ROOT / "subcast.spec"), "exec"), namespace)
    return captured["datas"]


def _write(workspace: Path, relative: str, contents: bytes = b"fixture") -> None:
    path = workspace / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)


def test_spec_packages_required_static_assets_and_excludes_user_assets(tmp_path, monkeypatch):
    workspace = tmp_path / "checkout"
    workspace.mkdir()
    (workspace / "subcast.spec").write_text((ROOT / "subcast.spec").read_text(encoding="utf-8"), encoding="utf-8")
    for path in (
        "index.html", "editor.html", "css/editor.css", "js/editor.js",
        "assets/icons/upload.svg", "assets/backgrounds/meta.json",
        "assets/backgrounds/uploaded.mp4", "fonts/uploaded.woff2",
    ):
        _write(workspace, f"frontend/{path}")
    _write(workspace, "bible.db")
    _write(workspace, "version.txt")

    datas = _capture_spec_datas(monkeypatch, workspace, oauth_present=True)
    packaged = {(Path(source).as_posix(), target) for source, target in datas}

    for relative in ("index.html", "editor.html", "css/editor.css", "js/editor.js", "assets/icons/upload.svg"):
        target = (Path("frontend") / Path(relative).parent).as_posix()
        assert (f"frontend/{relative}", target) in packaged
    assert ("bible.db", ".") in packaged
    assert ("version.txt", ".") in packaged
    assert (OAUTH_FILE, ".") in packaged
    assert not any("assets/backgrounds" in source or source.endswith(".mp4") or source.endswith("meta.json") for source, _ in packaged)
    assert not any(source.startswith("frontend/fonts/") for source, _ in packaged)


def test_spec_keeps_oauth_optional(tmp_path, monkeypatch):
    workspace = tmp_path / "checkout"
    workspace.mkdir()
    (workspace / "subcast.spec").write_text((ROOT / "subcast.spec").read_text(encoding="utf-8"), encoding="utf-8")
    _write(workspace, "frontend/index.html")

    datas = _capture_spec_datas(monkeypatch, workspace)

    assert not any(source == OAUTH_FILE for source, _ in datas)


def test_upgrade_payload_preserves_existing_user_data(tmp_path, monkeypatch):
    """Overlaying the new package must leave user-owned files byte-for-byte intact."""
    fixture = runpy.run_path(str(ROOT / "tests" / "release_upgrade_fixture.py"))
    install_root = tmp_path / "existing-install"
    state_file = tmp_path / "fixture-state.json"
    fixture["seed"](install_root, state_file)

    backgrounds = install_root / "frontend" / "assets" / "backgrounds"
    backgrounds.mkdir(parents=True, exist_ok=True)
    meta = backgrounds / "meta.json"
    user_files = [
        install_root / "data" / "projects" / "proj_upgrade.json",
        install_root / "data" / "active_project_id.txt",
        install_root / "data" / "templates.json",
        install_root / "data" / "mood_tags.json",
        install_root / "data" / "project_import_tag_mappings.json",
        install_root / "subcast_config.json",
        install_root / "subcast_user.db",
        meta,
        backgrounds / "upgrade-fixture.mp4",
        backgrounds / "thumb_upgrade-fixture.jpg",
        install_root / "frontend" / "fonts" / "fixture-font.woff2",
    ]
    before = {path.relative_to(install_root): path.read_bytes() for path in user_files}

    build_root = tmp_path / "new-build"
    build_root.mkdir()
    (build_root / "subcast.spec").write_text((ROOT / "subcast.spec").read_text(encoding="utf-8"), encoding="utf-8")
    for path in (
        "index.html", "css/editor.css", "js/editor.js", "assets/icons/upload.svg",
        "assets/backgrounds/new-default.jpg", "fonts/new-default.woff2",
    ):
        _write(build_root, f"frontend/{path}")
    _write(build_root, "bible.db", b"bundled bible")
    _write(build_root, "version.txt", b"1.3.26")

    datas = _capture_spec_datas(monkeypatch, build_root)
    app_payload = build_root / "dist" / "subcast"
    for source, target in datas:
        source_path = build_root / source
        destination = app_payload / target / source_path.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination)

    # Model the installer's recursive overlay: package files are replaced/copied,
    # while files absent from the payload remain available to the user.
    shutil.copytree(app_payload, install_root, dirs_exist_ok=True)

    for relative, contents in before.items():
        assert (install_root / relative).read_bytes() == contents, f"Upgrade changed user data: {relative}"
    project = json.loads((install_root / "data" / "projects" / "proj_upgrade.json").read_text(encoding="utf-8"))
    assert project["name"] == "Upgrade fixture"
    assert project["slides"][0]["elements"][0]["content"] == "업데이트 전 보존 가사"
    assert project["customFonts"][0]["family"] == "FixtureFont"
    assert json.loads(meta.read_text(encoding="utf-8"))["upgrade-fixture.mp4"]["title"] == "보존 배경"
    with sqlite3.connect(install_root / "subcast_user.db") as database:
        assert database.execute("SELECT lyrics FROM praise_songs WHERE title='Upgrade song'").fetchone() == ("Preserved lyrics",)
