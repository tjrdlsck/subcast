import os
import shutil
import tempfile
import unittest
from pathlib import Path

class TestDataMigration(unittest.TestCase):
    def setUp(self):
        # Create temporary directories for installation and AppData
        self.temp_dir = tempfile.TemporaryDirectory()
        self.install_dir = os.path.join(self.temp_dir.name, "install_dir")
        self.appdata_dir = os.path.join(self.temp_dir.name, "appdata", "Subcast")
        
        os.makedirs(self.install_dir, exist_ok=True)
        os.makedirs(self.appdata_dir, exist_ok=True)
        
        # Create mock data in install_dir
        self.mock_data_dir = os.path.join(self.install_dir, "data")
        os.makedirs(self.mock_data_dir, exist_ok=True)
        
        with open(os.path.join(self.mock_data_dir, "test_file.txt"), "w", encoding="utf-8") as f:
            f.write("mock data content")
            
        self.mock_db_path = os.path.join(self.install_dir, "GAE_Bible.db")
        with open(self.mock_db_path, "w", encoding="utf-8") as f:
            f.write("mock db content")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_migration_logic(self):
        # run.py's migration logic
        new_data_dir = os.path.join(self.appdata_dir, "data")
        for old_dir in [os.path.join(self.install_dir, "data"), os.path.join(self.install_dir, "_internal", "data")]:
            if os.path.exists(old_dir):
                shutil.copytree(old_dir, new_data_dir, dirs_exist_ok=True)
                
        new_db_path = os.path.join(self.appdata_dir, "GAE_Bible.db")
        for old_db in [os.path.join(self.install_dir, "GAE_Bible.db"), os.path.join(self.install_dir, "_internal", "GAE_Bible.db")]:
            if os.path.exists(old_db) and not os.path.exists(new_db_path):
                shutil.copy2(old_db, new_db_path)
                break

        # Verification
        self.assertTrue(os.path.exists(new_data_dir))
        self.assertTrue(os.path.exists(os.path.join(new_data_dir, "test_file.txt")))
        self.assertTrue(os.path.exists(new_db_path))

        with open(os.path.join(new_data_dir, "test_file.txt"), "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "mock data content")
            
        with open(new_db_path, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "mock db content")

if __name__ == '__main__':
    unittest.main()
