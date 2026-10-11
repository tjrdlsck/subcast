# -*- mode: python ; coding: utf-8 -*-
import os
from pathlib import Path

block_cipher = None
oauth_credentials = "client_secret_131602755526-k80ot6sq10ttqhos02vho3vuemj7khia.apps.googleusercontent.com.json"
datas = [
    ('frontend', 'frontend'),
    ('bible.db', '.'),
    ('version.txt', '.'),
]
if Path(oauth_credentials).is_file():
    datas.append((oauth_credentials, '.'))

a = Analysis(
    ['run.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'sqlite3',
        'httpx',
        'fastapi',
        'pydantic',
        'aiofiles',
        'pystray',
        'PIL'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

icon_path = 'assets/app.ico' if os.path.exists('assets/app.ico') else ('assets/icon.ico' if os.path.exists('assets/icon.ico') else None)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='subcast',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_path,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='subcast',
)
