"""Small Google Drive v3 client for immutable Subcast snapshots."""

from __future__ import annotations

import base64
import ctypes
import hashlib
import json
import logging
import os
import secrets
import sys
import threading
import urllib.parse
import uuid
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Callable

import httpx
from backend.database import APP_DATA_DIR

logger = logging.getLogger(__name__)

SCOPE = "https://www.googleapis.com/auth/drive.file"
DEFAULT_CLIENT_ID = "131602755526-k80ot6sq10ttqhos02vho3vuemj7khia.apps.googleusercontent.com"
OAUTH_CREDENTIALS_FILENAME = f"client_secret_{DEFAULT_CLIENT_ID}.json"
API = "https://www.googleapis.com/drive/v3"
UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
_attempt_lock = threading.Lock()
_oauth_attempt: dict[str, Any] | None = None


def _property_value(key: str, value: Any) -> str:
    raw = str(value or "").encode("utf-8")[:max(0, 124 - len(key.encode("utf-8")))]
    return raw.decode("utf-8", errors="ignore")


def _data_dir() -> Path:
    return Path(APP_DATA_DIR).resolve()


def _token_path() -> Path:
    return _data_dir() / "cloud_backup" / "oauth.bin"


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _dpapi(data: bytes, protect: bool) -> bytes:
    if os.name != "nt":
        raise RuntimeError("Google Drive 토큰 저장은 Windows DPAPI를 지원하는 환경에서만 사용할 수 있습니다.")
    source_buffer = ctypes.create_string_buffer(data)
    source = _DataBlob(len(data), ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_byte)))
    output = _DataBlob()
    crypt = ctypes.windll.crypt32
    kernel = ctypes.windll.kernel32
    if protect:
        ok = crypt.CryptProtectData(ctypes.byref(source), "Subcast Drive token", None, None, None, 1, ctypes.byref(output))
    else:
        ok = crypt.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output))
    if not ok:
        raise OSError("Windows DPAPI 토큰 처리에 실패했습니다.")
    try:
        return ctypes.string_at(output.pbData, output.cbData)
    finally:
        kernel.LocalFree(output.pbData)


def load_tokens() -> dict[str, Any] | None:
    path = _token_path()
    if not path.exists():
        return None
    try:
        return json.loads(_dpapi(path.read_bytes(), False).decode("utf-8"))
    except Exception:
        return None


def save_tokens(tokens: dict[str, Any]) -> None:
    path = _token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_bytes(_dpapi(json.dumps(tokens).encode("utf-8"), True))
    os.replace(temp, path)


def clear_tokens() -> None:
    _token_path().unlink(missing_ok=True)


def client_id() -> str:
    return os.environ.get("SUBCAST_GOOGLE_CLIENT_ID", DEFAULT_CLIENT_ID).strip()


def client_secret() -> str:
    configured = os.environ.get("SUBCAST_GOOGLE_CLIENT_SECRET", "").strip()
    if configured:
        return configured

    configured_path = os.environ.get("SUBCAST_GOOGLE_OAUTH_CREDENTIALS", "").strip()
    candidates = [Path(configured_path)] if configured_path else [
        Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2])) / OAUTH_CREDENTIALS_FILENAME,
        Path(sys.executable).resolve().parent / OAUTH_CREDENTIALS_FILENAME,
        Path(__file__).resolve().parents[2] / OAUTH_CREDENTIALS_FILENAME,
    ]
    for path in candidates:
        try:
            credentials = json.loads(path.read_text(encoding="utf-8")).get("installed", {})
        except (OSError, json.JSONDecodeError, AttributeError):
            continue
        if credentials.get("client_id") == client_id():
            secret = credentials.get("client_secret")
            if isinstance(secret, str) and secret.strip():
                return secret.strip()
    return ""


def exchange_authorization_code(code: str, *, verifier: str, redirect_uri: str) -> dict[str, Any]:
    response = httpx.post("https://oauth2.googleapis.com/token", data={
        "client_id": client_id(), "client_secret": client_secret(), "code": code,
        "code_verifier": verifier, "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    }, timeout=20)
    if response.is_error:
        try:
            error_data = response.json()
        except ValueError:
            error_data = {}
        logger.error(
            "Google OAuth token endpoint rejected the exchange (HTTP %s, error=%s, description=%s)",
            response.status_code,
            error_data.get("error", "unknown"),
            error_data.get("error_description", "unavailable"),
        )
    response.raise_for_status()
    return response.json()


def start_oauth() -> dict[str, str]:
    """Start a one-shot desktop OAuth PKCE loopback callback."""
    global _oauth_attempt
    cid = client_id()
    if not cid:
        raise RuntimeError("Google OAuth 클라이언트 ID가 설정되지 않았습니다.")
    secret = client_secret()
    if not secret:
        raise RuntimeError("Google OAuth 클라이언트 보안 비밀번호를 찾을 수 없습니다. 클라이언트 JSON 파일을 앱 폴더에 설치해 주세요.")
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).decode("ascii").rstrip("=")
    state = secrets.token_urlsafe(32)
    holder: dict[str, Any] = {"state": state, "verifier": verifier, "clientId": cid}

    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if query.get("state", [""])[0] != holder["state"]:
                self.send_error(400, "Invalid OAuth state")
                return
            oauth_error = query.get("error", [""])[0]
            if oauth_error:
                holder["error"] = "Google Drive 연결이 취소되었습니다."
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write("<!doctype html><meta charset='utf-8'><p>Google Drive 연결이 취소되었습니다. 창을 닫아도 됩니다.</p>".encode())
                threading.Thread(target=server.shutdown, daemon=True).start()
                return
            code = query.get("code", [""])[0]
            if not code:
                self.send_error(400, "Authorization was not completed")
                return
            try:
                token_data = exchange_authorization_code(
                    code, verifier=holder["verifier"], redirect_uri=holder["redirectUri"],
                )
                if not token_data.get("refresh_token"):
                    previous = load_tokens() or {}
                    token_data["refresh_token"] = previous.get("refresh_token")
                if not token_data.get("refresh_token"):
                    raise RuntimeError("Google이 갱신 토큰을 반환하지 않았습니다. 앱 권한을 취소한 뒤 다시 연결해 주세요.")
                save_tokens(token_data)
                holder["complete"] = True
                body = "Subcast Google Drive 연결이 완료되었습니다. 이 창을 닫아도 됩니다."
                status = 200
            except Exception:
                logger.exception("Google Drive OAuth token exchange or token storage failed")
                holder["error"] = "Google Drive 인증을 완료하지 못했습니다. 다시 시도해 주세요."
                body = holder["error"]
                status = 500
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"<!doctype html><meta charset='utf-8'><title>Subcast</title><p>{body}</p>".encode())
            threading.Thread(target=server.shutdown, daemon=True).start()

        def log_message(self, *_args):
            return

    server = HTTPServer(("127.0.0.1", 0), CallbackHandler)
    port = server.server_address[1]
    redirect_uri = f"http://127.0.0.1:{port}/oauth2callback"
    holder["redirectUri"] = redirect_uri
    holder["server"] = server
    params = {
        "client_id": cid, "redirect_uri": redirect_uri, "response_type": "code", "scope": SCOPE,
        "code_challenge": challenge, "code_challenge_method": "S256", "state": state,
        "access_type": "offline", "prompt": "consent",
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    with _attempt_lock:
        if _oauth_attempt and _oauth_attempt.get("server"):
            _oauth_attempt["server"].shutdown()
        _oauth_attempt = holder
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return {"authorizationUrl": url, "redirectUri": redirect_uri}


def oauth_status() -> dict[str, Any]:
    with _attempt_lock:
        attempt = _oauth_attempt
    if attempt and attempt.get("error"):
        return {"connected": False, "error": attempt["error"]}
    tokens = load_tokens()
    return {"connected": bool(tokens and tokens.get("refresh_token")), "pending": bool(attempt and not attempt.get("complete"))}


class GoogleDriveClient:
    def __init__(self):
        if not client_id() or not client_secret():
            raise RuntimeError("Google OAuth 클라이언트 자격 증명이 설정되지 않았습니다.")
        self.tokens = load_tokens() or {}
        self._folder_ids: dict[str, str] = {}
        if not self.tokens.get("refresh_token"):
            raise RuntimeError("Google Drive 연결이 필요합니다.")

    def _access_token(self) -> str:
        if self.tokens.get("access_token") and float(self.tokens.get("expires_at", 0)) > __import__("time").time() + 60:
            return self.tokens["access_token"]
        response = httpx.post("https://oauth2.googleapis.com/token", data={
            "client_id": client_id(), "client_secret": client_secret(),
            "refresh_token": self.tokens["refresh_token"], "grant_type": "refresh_token",
        }, timeout=20)
        if response.status_code == 400 and response.json().get("error") == "invalid_grant":
            clear_tokens()
            raise RuntimeError("Google Drive 연결이 만료되었습니다. 계정을 다시 연결해 주세요.")
        response.raise_for_status()
        renewed = response.json()
        self.tokens.update(renewed)
        self.tokens["expires_at"] = __import__("time").time() + renewed.get("expires_in", 3600)
        save_tokens(self.tokens)
        return self.tokens["access_token"]

    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        headers = dict(kwargs.pop("headers", {}))
        headers["Authorization"] = f"Bearer {self._access_token()}"
        response = httpx.request(method, path if path.startswith("https://") else API + path, headers=headers, timeout=60, **kwargs)
        if response.status_code == 401:
            self.tokens["expires_at"] = 0
            headers["Authorization"] = f"Bearer {self._access_token()}"
            response = httpx.request(method, path if path.startswith("https://") else API + path, headers=headers, timeout=60, **kwargs)
        response.raise_for_status()
        return response

    def _folder_id(self) -> str:
        if folder_id := getattr(self, "_folder_ids", {}).get("root"):
            return folder_id
        stored = _data_dir() / "cloud_backup" / "drive_folder.json"
        if stored.exists():
            try:
                folder_id = json.loads(stored.read_text(encoding="utf-8")).get("folderId")
                if folder_id:
                    response = self.request("GET", f"/files/{folder_id}", params={"fields": "id,trashed"})
                    if not response.json().get("trashed"):
                        self._folder_ids["root"] = folder_id
                        return folder_id
            except Exception:
                pass
        query = "name='Subcast' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = self.request("GET", "/files", params={"q": query, "fields": "files(id,name)", "spaces": "drive"}).json().get("files", [])
        if results:
            folder_id = results[0]["id"]
        else:
            response = self.request("POST", "/files", json={"name": "Subcast", "mimeType": "application/vnd.google-apps.folder"})
            folder_id = response.json()["id"]
        stored.parent.mkdir(parents=True, exist_ok=True)
        stored.write_text(json.dumps({"folderId": folder_id}), encoding="utf-8")
        self._folder_ids["root"] = folder_id
        return folder_id

    def _environment_folder_id(self) -> str:
        if folder_id := getattr(self, "_folder_ids", {}).get("environment"):
            return folder_id
        stored = _data_dir() / "cloud_backup" / "environment_folder.json"
        if stored.exists():
            try:
                folder_id = json.loads(stored.read_text(encoding="utf-8")).get("folderId")
                if folder_id:
                    response = self.request("GET", f"/files/{folder_id}", params={"fields": "id,trashed"})
                    if not response.json().get("trashed"):
                        self._folder_ids["environment"] = folder_id
                        return folder_id
            except Exception:
                pass
        parent_id = self._folder_id()
        query = f"'{parent_id}' in parents and name='Environment' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = self.request("GET", "/files", params={
            "q": query, "fields": "files(id,name)", "spaces": "drive", "pageSize": 10,
        }).json().get("files", [])
        if results:
            folder_id = results[0]["id"]
        else:
            response = self.request("POST", "/files", json={
                "name": "Environment", "mimeType": "application/vnd.google-apps.folder", "parents": [parent_id],
            })
            folder_id = response.json()["id"]
        stored.parent.mkdir(parents=True, exist_ok=True)
        stored.write_text(json.dumps({"folderId": folder_id}), encoding="utf-8")
        self._folder_ids["environment"] = folder_id
        return folder_id

    def find_environment_manifest(self, cached_file_id: str | None = None) -> tuple[dict[str, Any] | None, bytes | None]:
        file_info = None
        if cached_file_id:
            try:
                file_info = self.request("GET", f"/files/{cached_file_id}", params={
                    "fields": "id,name,modifiedTime,size,appProperties,trashed",
                }).json()
                if file_info.get("trashed"):
                    file_info = None
            except Exception:
                file_info = None
        if not file_info:
            folder_id = self._environment_folder_id()
            query = f"'{folder_id}' in parents and appProperties has {{ key='subcastKind' and value='environmentManifest' }} and trashed=false"
            found = self.request("GET", "/files", params={
                "q": query, "fields": "files(id,name,modifiedTime,size,appProperties)", "spaces": "drive", "pageSize": 10,
            }).json().get("files", [])
            if not found:
                return None, None
            file_info = max(found, key=lambda item: item.get("modifiedTime", ""))
        content = self.download_snapshot(file_info["id"])
        return file_info, content

    def upload_environment_manifest(self, content: bytes, file_id: str | None = None) -> dict[str, Any]:
        metadata = {"appProperties": {"subcastKind": "environmentManifest", "formatVersion": "1"}}
        if file_id:
            endpoint = f"files/{urllib.parse.quote(file_id)}?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties"
        else:
            metadata.update({"name": "environment.subcast.json", "mimeType": "application/json",
                             "parents": [self._environment_folder_id()]})
            endpoint = "files?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties"
        return self._upload_multipart(metadata, content, "application/json", endpoint,
                                      method="PATCH" if file_id else "POST")

    def upload_environment_asset(self, content: Path, sha256: str,
                                 progress_callback: Callable[[int], None] | None = None) -> dict[str, Any]:
        size = content.stat().st_size
        metadata = {
            "name": f"{sha256}.asset", "mimeType": "application/octet-stream",
            "parents": [self._environment_folder_id()],
            "appProperties": {"subcastKind": "environmentAsset", "sha256": sha256},
        }
        return self._upload_resumable(metadata, content, size, progress_callback=progress_callback)

    def delete_environment_asset(self, file_id: str) -> None:
        self.request("DELETE", f"/files/{urllib.parse.quote(file_id)}")

    def list_snapshots(self, cloud_project_id: str | None = None) -> list[dict[str, Any]]:
        folder_id = self._folder_id()
        query = f"'{folder_id}' in parents and trashed=false"
        page_token = None
        output: list[dict[str, Any]] = []
        while True:
            params = {"q": query, "spaces": "drive", "pageSize": 1000,
                      "fields": "nextPageToken,files(id,name,createdTime,size,appProperties,mimeType)", "orderBy": "createdTime desc"}
            if page_token:
                params["pageToken"] = page_token
            data = self.request("GET", "/files", params=params).json()
            for item in data.get("files", []):
                props = item.get("appProperties", {})
                if item.get("name", "").endswith(".subcast") and (not cloud_project_id or props.get("cloudProjectId") == cloud_project_id):
                    output.append({**props, "parentSnapshotId": props.get("parentSnapshotId") or None,
                                   "fileId": item["id"], "createdAt": item.get("createdTime", ""), "size": item.get("size")})
            page_token = data.get("nextPageToken")
            if not page_token:
                return output

    def upload_snapshot(self, package: bytes, manifest: dict[str, Any]) -> dict[str, Any]:
        property_keys = ("snapshotId", "parentSnapshotId", "branchId", "cloudProjectId", "deviceLabel", "projectName")
        metadata = {"name": f"{manifest['snapshotId']}.subcast", "mimeType": "application/vnd.subcast.backup",
                    "parents": [self._folder_id()], "appProperties": {
                        key: _property_value(key, manifest.get(key)) for key in property_keys
                    }}
        return self._upload_multipart(metadata, package, "application/vnd.subcast.backup",
                                      "files?uploadType=multipart&fields=id,name,createdTime,size,appProperties")

    def upload_asset(self, content: bytes | Path, sha256: str) -> str:
        folder_id = self._folder_id()
        name = f"{sha256}.asset"
        if isinstance(content, Path):
            size = content.stat().st_size
            md5 = hashlib.md5()
            with content.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    md5.update(chunk)
            md5_hex = md5.hexdigest()
        else:
            size = len(content)
            md5_hex = hashlib.md5(content).hexdigest()
        query = f"'{folder_id}' in parents and appProperties has {{ key='sha256' and value='{sha256}' }} and trashed=false"
        found = self.request("GET", "/files", params={"q": query, "spaces": "drive",
                           "fields": "files(id,name,size,md5Checksum)", "pageSize": 20}).json().get("files", [])
        for item in found:
            if int(item.get("size", -1)) == size and item.get("md5Checksum") == md5_hex:
                return item["id"]
        if found:
            name = f"{sha256}-{uuid.uuid4().hex[:8]}.asset"
        metadata = {"name": name, "mimeType": "application/octet-stream", "parents": [folder_id],
                    "appProperties": {"sha256": sha256}}
        created = self._upload_resumable(metadata, content, size)
        return created["id"]

    def _upload_resumable(self, metadata: dict[str, Any], content: bytes | Path, size: int,
                          progress_callback: Callable[[int], None] | None = None) -> dict[str, Any]:
        endpoint = UPLOAD_API + "/files?uploadType=resumable&fields=id,name,size"
        response = self.request("POST", endpoint, json=metadata, headers={
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "application/octet-stream",
            "X-Upload-Content-Length": str(size),
        })
        upload_url = response.headers.get("Location")
        if not upload_url:
            raise RuntimeError("Google Drive가 재개 가능한 업로드 주소를 반환하지 않았습니다.")
        chunk_size = 8 * 1024 * 1024
        if isinstance(content, Path):
            source = content.open("rb")
            close_source = True
        else:
            from io import BytesIO
            source = BytesIO(content)
            close_source = True
        try:
            start = 0
            while True:
                chunk = source.read(chunk_size)
                if not chunk and size != 0:
                    break
                end = start + len(chunk) - 1
                headers = {"Authorization": f"Bearer {self._access_token()}",
                           "Content-Length": str(len(chunk)),
                           "Content-Range": f"bytes {start}-{end}/{size}" if size else "bytes */0"}
                result = httpx.put(upload_url, content=chunk, headers=headers, timeout=120)
                if result.status_code in {200, 201}:
                    if progress_callback:
                        progress_callback(min(size, start + len(chunk)))
                    return result.json()
                if result.status_code != 308:
                    result.raise_for_status()
                    raise RuntimeError(f"Google Drive 업로드가 완료되지 않았습니다: {result.status_code}")
                start = end + 1
                if progress_callback:
                    progress_callback(min(size, start))
                if start >= size:
                    raise RuntimeError("Google Drive가 마지막 업로드 청크를 완료하지 않았습니다.")
        finally:
            if close_source:
                source.close()
        raise RuntimeError("Google Drive 업로드가 비정상적으로 종료되었습니다.")

    def _upload_multipart(self, metadata: dict[str, Any], content: bytes, mime_type: str, endpoint: str,
                          method: str = "POST") -> dict[str, Any]:
        boundary = "subcast_" + uuid.uuid4().hex
        body = (f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode() +
                json.dumps(metadata).encode("utf-8") + f"\r\n--{boundary}\r\nContent-Type: {mime_type}\r\n\r\n".encode() +
                content + f"\r\n--{boundary}--".encode())
        response = self.request(method, UPLOAD_API + "/" + endpoint,
                                content=body, headers={"Content-Type": f"multipart/related; boundary={boundary}"})
        return response.json()

    def download_snapshot(self, file_id: str) -> bytes:
        return self.request("GET", f"{API}/files/{urllib.parse.quote(file_id)}?alt=media").content

    def download_file_to_path(self, file_id: str, destination: Path,
                              progress_callback: Callable[[int], None] | None = None) -> None:
        url = f"{API}/files/{urllib.parse.quote(file_id)}?alt=media"
        headers = {"Authorization": f"Bearer {self._access_token()}"}
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp = destination.with_suffix(destination.suffix + ".tmp")
        try:
            for attempt in range(2):
                headers["Authorization"] = f"Bearer {self._access_token()}"
                with httpx.stream("GET", url, headers=headers, timeout=120) as response:
                    if response.status_code == 401 and attempt == 0:
                        self.tokens["expires_at"] = 0
                        continue
                    response.raise_for_status()
                    with temp.open("wb") as output:
                        downloaded = 0
                        for chunk in response.iter_bytes(1024 * 1024):
                            output.write(chunk)
                            downloaded += len(chunk)
                            if progress_callback:
                                progress_callback(downloaded)
                os.replace(temp, destination)
                return
        except Exception:
            temp.unlink(missing_ok=True)
            raise
