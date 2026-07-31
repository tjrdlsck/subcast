import unittest
import json

class TestMonitoringSettings(unittest.TestCase):
    def test_settings_structure(self):
        settings = {
            "layoutMode": "custom_canvas",
            "bibleMode": "summary",
            "currentBg": "transparent",
            "currentTextColor": "#FFFFFF",
            "nextBg": "transparent",
            "nextTextColor": "#A0A0A0",
            "currentBox": {
                "leftPct": 5.0,
                "topPct": 5.0,
                "widthPct": 90.0,
                "heightPct": 42.0,
                "fontSize": 28,
                "isTransparentBg": True,
                "textColor": "#FFFFFF",
                "bgColor": "transparent"
            },
            "nextBox": {
                "leftPct": 5.0,
                "topPct": 51.0,
                "widthPct": 90.0,
                "heightPct": 42.0,
                "fontSize": 22,
                "isTransparentBg": True,
                "textColor": "#A0A0A0",
                "bgColor": "transparent"
            }
        }
        
        json_str = json.dumps(settings)
        parsed = json.loads(json_str)
        
        self.assertEqual(parsed["currentBox"]["fontSize"], 28)
        self.assertTrue(parsed["currentBox"]["isTransparentBg"])
        self.assertEqual(parsed["nextBox"]["fontSize"], 22)
        self.assertTrue(parsed["nextBox"]["isTransparentBg"])

if __name__ == '__main__':
    unittest.main()
