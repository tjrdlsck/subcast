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
    config = uvicorn.Config(app, host='127.0.0.1', port=port, log_level='info')
    (data_dir / 'ready.json').write_text(json.dumps({'port': port}), encoding='utf-8')
    uvicorn.Server(config).run(sockets=[listener])


if __name__ == '__main__':
    main()
