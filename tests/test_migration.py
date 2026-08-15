import os
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path
from backend.services.migration_service import migrate_legacy_db_if_needed
from backend.services.praise_service import PraiseDatabaseHelper
from backend.monitor_repository import MonitorSettingsRepository


class TestDataMigration(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.install_dir = os.path.join(self.temp_dir.name, "install_dir")
        self.appdata_dir = os.path.join(self.temp_dir.name, "appdata", "Subcast")
        
        os.makedirs(self.install_dir, exist_ok=True)
        os.makedirs(self.appdata_dir, exist_ok=True)
        
        # 1. Create mock data in install_dir
        self.mock_data_dir = os.path.join(self.install_dir, "data")
        os.makedirs(self.mock_data_dir, exist_ok=True)
        with open(os.path.join(self.mock_data_dir, "test_file.txt"), "w", encoding="utf-8") as f:
            f.write("mock data content")
            
        # 2. Create legacy GAE_Bible.db in appdata with praise_songs & monitor_settings
        self.legacy_db_path = os.path.join(self.appdata_dir, "GAE_Bible.db")
        conn = sqlite3.connect(self.legacy_db_path)
        conn.execute("""
            CREATE TABLE praise_songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                lyrics TEXT NOT NULL,
                mood TEXT DEFAULT '기본/일반',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            INSERT INTO praise_songs (title, lyrics, mood)
            VALUES ('은혜로다', '시작됐네 우리 주님의 능력이', '찬양/경배')
        """)
        conn.execute("""
            CREATE TABLE monitor_settings (
                setting_id TEXT PRIMARY KEY DEFAULT 'default_profile',
                layout_mode TEXT NOT NULL DEFAULT 'custom_canvas',
                current_font_size INTEGER NOT NULL DEFAULT 32,
                current_text_color TEXT NOT NULL DEFAULT '#FFFF00'
            )
        """)
        conn.execute("""
            INSERT INTO monitor_settings (setting_id, layout_mode, current_font_size, current_text_color)
            VALUES ('default_profile', 'custom_canvas', 32, '#FFFF00')
        """)
        conn.commit()
        conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_legacy_data_migration(self):
        # 1. Directory migration logic
        new_data_dir = os.path.join(self.appdata_dir, "data")
        for old_dir in [os.path.join(self.install_dir, "data"), os.path.join(self.install_dir, "_internal", "data")]:
            if os.path.exists(old_dir):
                shutil.copytree(old_dir, new_data_dir, dirs_exist_ok=True)
                
        # 2. Execute DB migration
        result = migrate_legacy_db_if_needed(self.appdata_dir, self.install_dir)
        self.assertTrue(result)

        # 3. Verify subcast_user.db creation
        user_db_path = os.path.join(self.appdata_dir, "subcast_user.db")
        self.assertTrue(os.path.exists(user_db_path))

        # 4. Verify migrated praise_songs
        praise_helper = PraiseDatabaseHelper(user_db_path)
        songs = praise_helper.search_songs("은혜로다")
        self.assertEqual(len(songs), 1)
        self.assertEqual(songs[0]["title"], "은혜로다")
        self.assertIn("시작됐네", songs[0]["lyrics"])
        self.assertEqual(songs[0]["mood"], "찬양/경배")

        # 5. Verify migrated monitor_settings
        monitor_repo = MonitorSettingsRepository(user_db_path)
        settings = monitor_repo.get_settings("default_profile")
        self.assertIsNotNone(settings)
        self.assertEqual(settings["currentBox"]["fontSize"], 32)
        self.assertEqual(settings["currentBox"]["textColor"], "#FFFF00")

        # 6. Verify backup created
        backup_path = os.path.join(self.appdata_dir, "GAE_Bible.db.legacy_backup")
        self.assertTrue(os.path.exists(backup_path))


if __name__ == '__main__':
    unittest.main()

