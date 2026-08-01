import os
import sqlite3
import pytest
from backend.database import init_monitor_db, get_db_connection

def test_monitor_db_migration(tmp_path):
    db_file = str(tmp_path / "test_monitor.db")
    
    # 1. DB 초기화/마이그레이션 실행
    init_monitor_db(db_file)
    
    # 2. 테이블 존재 여부 확인
    conn = get_db_connection(db_file)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='monitor_settings'")
    table_name = cursor.fetchone()
    assert table_name is not None
    assert table_name[0] == "monitor_settings"
    
    # 3. 기본 프로필 레코드 생성 여부 확인
    cursor.execute("SELECT * FROM monitor_settings WHERE setting_id = 'default_profile'")
    row = cursor.fetchone()
    assert row is not None
    assert row["setting_id"] == "default_profile"
    assert row["layout_mode"] == "custom_canvas"
    assert row["current_left_pct"] == 5.0
    assert row["current_top_pct"] == 5.0
    assert row["current_width_pct"] == 90.0
    assert row["current_height_pct"] == 42.0
    assert row["current_font_size"] == 28
    assert row["next_left_pct"] == 5.0
    assert row["next_top_pct"] == 51.0
    assert row["next_width_pct"] == 90.0
    assert row["next_height_pct"] == 42.0
    assert row["next_font_size"] == 22
    
    conn.close()

def test_monitor_db_idempotent(tmp_path):
    db_file = str(tmp_path / "test_monitor.db")
    init_monitor_db(db_file)
    # 두 번 실행해도 덮어쓰거나 에러가 나지 않는지 (Idempotent check)
    init_monitor_db(db_file)
    
    conn = get_db_connection(db_file)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM monitor_settings")
    count = cursor.fetchone()[0]
    assert count == 1
    conn.close()
