"""Run the real backend with disposable storage and a local static copy."""

import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import time


_TIMING_STARTED = time.perf_counter()
_TIMING_REQUEST_ID = 0


def _emit_timing(event: str, **fields) -> None:
    print('SUBCAST_TEST_TIMING ' + json.dumps({
        'event': event,
        'atMs': round((time.perf_counter() - _TIMING_STARTED) * 1000, 3),
        'wallTimeEpochMs': time.time_ns() / 1_000_000,
        **fields,
    }, ensure_ascii=False), flush=True)


class ASGITimingMiddleware:
    """Record API and WebSocket timing without capturing application data."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        global _TIMING_REQUEST_ID
        scope_type = scope['type']
        path = scope.get('path', '')
        if scope_type != 'websocket' and not (scope_type == 'http' and path.startswith('/api/')):
            return await self.app(scope, receive, send)

        _TIMING_REQUEST_ID += 1
        request_id = _TIMING_REQUEST_ID
        started = time.perf_counter()
        is_websocket = scope_type == 'websocket'
        fields = {'id': request_id, 'path': path}
        if is_websocket:
            query = scope.get('query_string', b'').decode('ascii', errors='ignore')
            fields['role'] = next((part.split('=', 1)[1] for part in query.split('&') if part.startswith('role=')), '')
            _emit_timing('ws.start', **fields)
        else:
            fields['method'] = scope.get('method', '')
            _emit_timing('http.start', **fields)

        response_status = None
        first_ws_send = False
        completed = False

        async def timed_receive():
            message = await receive()
            if is_websocket and message.get('type') == 'websocket.receive':
                raw = message.get('text')
                if raw is None and message.get('bytes'):
                    raw = message['bytes'].decode('utf-8', errors='ignore')
                if raw:
                    try:
                        message_type = json.loads(raw).get('type')
                    except (json.JSONDecodeError, AttributeError):
                        message_type = None
                    if message_type == 'LOCK_SLIDE':
                        _emit_timing('ws.message_received', **fields, messageType=message_type)
            return message

        async def timed_send(message):
            nonlocal response_status, first_ws_send, completed
            message_type = message.get('type')
            if message_type == 'http.response.start':
                response_status = message.get('status')
            await send(message)
            if not is_websocket and message_type == 'http.response.body' and not message.get('more_body', False):
                completed = True
                _emit_timing('http.complete', **fields, status=response_status,
                             durationMs=round((time.perf_counter() - started) * 1000, 3))
            elif is_websocket and message_type == 'websocket.accept':
                _emit_timing('ws.accept', **fields,
                             durationMs=round((time.perf_counter() - started) * 1000, 3))
            elif is_websocket and message_type == 'websocket.send' and not first_ws_send:
                first_ws_send = True
                payload = message.get('text') or message.get('bytes') or b''
                if isinstance(payload, str):
                    try:
                        payload_type = json.loads(payload).get('type')
                    except (json.JSONDecodeError, AttributeError):
                        payload_type = None
                    payload_bytes = len(payload.encode('utf-8'))
                else:
                    payload_type = None
                    payload_bytes = len(payload)
                _emit_timing('ws.first_send', **fields, payloadType=payload_type,
                             payloadBytes=payload_bytes,
                             durationMs=round((time.perf_counter() - started) * 1000, 3))
            elif is_websocket and message_type == 'websocket.send':
                payload = message.get('text') or message.get('bytes') or b''
                if isinstance(payload, bytes):
                    payload = payload.decode('utf-8', errors='ignore')
                try:
                    payload_type = json.loads(payload).get('type')
                except (json.JSONDecodeError, AttributeError):
                    payload_type = None
                if payload_type == 'SLIDE_LOCKED':
                    _emit_timing('ws.message_sent', **fields, messageType=payload_type)

        try:
            await self.app(scope, timed_receive, timed_send)
        finally:
            if not is_websocket and not completed:
                _emit_timing('http.incomplete', **fields, status=response_status,
                             durationMs=round((time.perf_counter() - started) * 1000, 3))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', required=True, type=Path)
    parser.add_argument('--port', type=int, default=0)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    data_dir = args.data_dir.resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    frontend = data_dir / 'frontend'
    if not (frontend / 'editor.html').exists():
        shutil.copytree(root / 'frontend', frontend,
                        ignore=shutil.ignore_patterns('backgrounds', 'fonts'), dirs_exist_ok=True)
    (frontend / 'assets' / 'backgrounds').mkdir(parents=True, exist_ok=True)
    (frontend / 'fonts').mkdir(parents=True, exist_ok=True)

    bible_path = data_dir / 'bible.db'
    with sqlite3.connect(bible_path) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS bible '
                     '(id INTEGER PRIMARY KEY, version_code TEXT, book_code TEXT, '
                     'book_name TEXT, chapter INTEGER, verse INTEGER, content TEXT, title TEXT)')
        if not conn.execute('SELECT COUNT(*) FROM bible').fetchone()[0]:
            for version in ('KRV', 'NIV'):
                for verse, word in enumerate(('첫', '두', '세', '네', '다섯'), start=1):
                    conn.execute('INSERT INTO bible VALUES (NULL, ?, ?, ?, 1, ?, ?, NULL)',
                                 (version, 'GEN', '창세기', verse, f'{word} 번째 시험 구절'))

    os.environ['SUBCAST_DATA_DIR'] = str(data_dir)
    os.environ['SUBCAST_USER_DB_PATH'] = str(data_dir / 'subcast_user.db')
    os.environ['SUBCAST_BIBLE_DB_PATH'] = str(bible_path)
    # Relative legacy DB and downloaded font paths must stay inside test storage.
    os.chdir(data_dir)
    sys.path.insert(0, str(root))
    from backend.main import app
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import JSONResponse
    import uvicorn

    for route in app.routes:
        if getattr(route, 'name', None) == 'static':
            route.app = StaticFiles(directory=str(frontend))

    # Regression tests must never launch a real installer, even via API helpers.
    app.router.routes = [route for route in app.router.routes
                         if getattr(route, 'path', None) != '/api/system/auto-update']
    app.add_api_route('/api/system/auto-update',
                     lambda: JSONResponse({'detail': 'Installer execution disabled in browser tests.'}, status_code=403),
                     methods=['POST'])

    video = data_dir / 'sample.mp4'
    if not video.exists():
        import imageio_ffmpeg
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-f', 'lavfi',
                        '-i', 'color=c=blue:s=160x90:d=2', '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p', '-y', str(video)], check=True, timeout=20)

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(('127.0.0.1', args.port))
    port = listener.getsockname()[1]
    served_app = ASGITimingMiddleware(app) if os.environ.get('SUBCAST_TEST_TIMING') == '1' else app
    config = uvicorn.Config(served_app, host='127.0.0.1', port=port, log_level='info')
    (data_dir / 'ready.json').write_text(json.dumps({'port': port}), encoding='utf-8')
    uvicorn.Server(config).run(sockets=[listener])


if __name__ == '__main__':
    main()
