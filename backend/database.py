import sqlite3
import os
from pathlib import Path

DEFAULT_DB_PATH = os.environ.get("SUBCAST_DB_PATH", "GAE_Bible.db")

CREATE_MONITOR_SETTINGS_TABLE = """
CREATE TABLE IF NOT EXISTS monitor_settings (
    setting_id TEXT PRIMARY KEY DEFAULT 'default_profile',
    layout_mode TEXT NOT NULL DEFAULT 'custom_canvas',
    current_left_pct REAL NOT NULL DEFAULT 5.0,
    current_top_pct REAL NOT NULL DEFAULT 5.0,
    current_width_pct REAL NOT NULL DEFAULT 90.0,
    current_height_pct REAL NOT NULL DEFAULT 42.0,
    current_font_size INTEGER NOT NULL DEFAULT 28,
    current_text_color TEXT NOT NULL DEFAULT '#FFFFFF',
    current_stroke_color TEXT DEFAULT 'transparent',
    current_stroke_width INTEGER DEFAULT 0,
    current_bg_color TEXT NOT NULL DEFAULT 'transparent',
    current_is_transparent INTEGER NOT NULL DEFAULT 1 CHECK (current_is_transparent IN (0, 1)),
    current_font_weight TEXT DEFAULT 'bold',
    current_font_style TEXT DEFAULT 'normal',
    current_font_family TEXT DEFAULT 'Inter',
    current_text_align TEXT DEFAULT 'center',
    current_opacity REAL DEFAULT 1.0,
    
    next_left_pct REAL NOT NULL DEFAULT 5.0,
    next_top_pct REAL NOT NULL DEFAULT 51.0,
    next_width_pct REAL NOT NULL DEFAULT 90.0,
    next_height_pct REAL NOT NULL DEFAULT 42.0,
    next_font_size INTEGER NOT NULL DEFAULT 22,
    next_text_color TEXT NOT NULL DEFAULT '#A0A0A0',
    next_stroke_color TEXT DEFAULT 'transparent',
    next_stroke_width INTEGER DEFAULT 0,
    next_bg_color TEXT NOT NULL DEFAULT 'transparent',
    next_is_transparent INTEGER NOT NULL DEFAULT 1 CHECK (next_is_transparent IN (0, 1)),
    next_font_weight TEXT DEFAULT '600',
    next_font_style TEXT DEFAULT 'normal',
    next_font_family TEXT DEFAULT 'Inter',
    next_text_align TEXT DEFAULT 'center',
    next_opacity REAL DEFAULT 1.0,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

INSERT_DEFAULT_SETTINGS = """
INSERT INTO monitor_settings (
    setting_id, layout_mode,
    current_left_pct, current_top_pct, current_width_pct, current_height_pct,
    current_font_size, current_text_color, current_bg_color, current_is_transparent,
    current_font_weight, current_font_family, current_text_align,
    next_left_pct, next_top_pct, next_width_pct, next_height_pct,
    next_font_size, next_text_color, next_bg_color, next_is_transparent,
    next_font_weight, next_font_family, next_text_align
) VALUES (
    'default_profile', 'custom_canvas',
    5.0, 5.0, 90.0, 42.0, 28, '#FFFFFF', 'transparent', 1, 'bold', 'Inter', 'center',
    5.0, 51.0, 90.0, 42.0, 22, '#A0A0A0', 'transparent', 1, '600', 'Inter', 'center'
) ON CONFLICT(setting_id) DO NOTHING;
"""

def get_db_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_monitor_db(db_path: str = DEFAULT_DB_PATH) -> None:
    """monitor_settings 테이블 생성 및 기본 프로필 레코드 초기화"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(CREATE_MONITOR_SETTINGS_TABLE)

    cursor.execute("PRAGMA table_info(monitor_settings)")
    existing_cols = [row[1] for row in cursor.fetchall()]
    new_cols = {
        "current_font_weight": "TEXT DEFAULT 'bold'",
        "current_font_style": "TEXT DEFAULT 'normal'",
        "current_font_family": "TEXT DEFAULT 'Inter'",
        "current_text_align": "TEXT DEFAULT 'center'",
        "current_stroke_color": "TEXT DEFAULT 'transparent'",
        "current_stroke_width": "INTEGER DEFAULT 0",
        "current_opacity": "REAL DEFAULT 1.0",
        "next_font_weight": "TEXT DEFAULT '600'",
        "next_font_style": "TEXT DEFAULT 'normal'",
        "next_font_family": "TEXT DEFAULT 'Inter'",
        "next_text_align": "TEXT DEFAULT 'center'",
        "next_stroke_color": "TEXT DEFAULT 'transparent'",
        "next_stroke_width": "INTEGER DEFAULT 0",
        "next_opacity": "REAL DEFAULT 1.0",
        "custom_elements": "TEXT DEFAULT '[]'",
    }
    for col_name, col_type in new_cols.items():
        if col_name not in existing_cols:
            cursor.execute(f"ALTER TABLE monitor_settings ADD COLUMN {col_name} {col_type}")

    cursor.execute(INSERT_DEFAULT_SETTINGS)
    conn.commit()
    conn.close()
