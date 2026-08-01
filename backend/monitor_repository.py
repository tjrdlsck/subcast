import sqlite3
import json
from typing import Dict, Any, Optional
from datetime import datetime
from backend.database import get_db_connection, init_monitor_db, DEFAULT_DB_PATH

def validate_box_settings(box_name: str, box_data: Dict[str, Any]) -> None:
    left_pct = float(box_data.get("leftPct", 0.0))
    top_pct = float(box_data.get("topPct", 0.0))
    width_pct = float(box_data.get("widthPct", 0.0))
    height_pct = float(box_data.get("heightPct", 0.0))
    font_size = int(box_data.get("fontSize", 28))

    if not (0.0 <= left_pct <= 100.0):
        raise ValueError(f"{box_name}.leftPct must be between 0 and 100")
    if not (0.0 <= top_pct <= 100.0):
        raise ValueError(f"{box_name}.topPct must be between 0 and 100")
    if not (0.0 <= width_pct <= 100.0):
        raise ValueError(f"{box_name}.widthPct must be between 0 and 100")
    if not (0.0 <= height_pct <= 100.0):
        raise ValueError(f"{box_name}.heightPct must be between 0 and 100")

    if left_pct + width_pct > 100.0:
        raise ValueError(f"leftPct + widthPct must not exceed 100%")
    if top_pct + height_pct > 100.0:
        raise ValueError(f"topPct + heightPct must not exceed 100%")

    if not (10 <= font_size <= 200):
        raise ValueError(f"{box_name}.fontSize must be between 10 and 200")

def validate_monitor_settings(settings: Dict[str, Any]) -> None:
    if "currentBox" in settings:
        validate_box_settings("currentBox", settings["currentBox"])
    if "nextBox" in settings:
        validate_box_settings("nextBox", settings["nextBox"])

class MonitorSettingsRepository:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        init_monitor_db(self.db_path)

    def get_settings(self, setting_id: str = "default_profile") -> Optional[Dict[str, Any]]:
        conn = get_db_connection(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM monitor_settings WHERE setting_id = ?", (setting_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        custom_elements = []
        if "custom_elements" in row.keys() and row["custom_elements"]:
            try:
                custom_elements = json.loads(row["custom_elements"])
            except Exception:
                custom_elements = []

        return {
            "settingId": row["setting_id"],
            "layoutMode": row["layout_mode"],
            "currentBox": {
                "leftPct": row["current_left_pct"],
                "topPct": row["current_top_pct"],
                "widthPct": row["current_width_pct"],
                "heightPct": row["current_height_pct"],
                "fontSize": row["current_font_size"],
                "textColor": row["current_text_color"],
                "strokeColor": row["current_stroke_color"] if "current_stroke_color" in row.keys() and row["current_stroke_color"] else "transparent",
                "strokeWidth": row["current_stroke_width"] if "current_stroke_width" in row.keys() and row["current_stroke_width"] is not None else 0,
                "bgColor": row["current_bg_color"],
                "isTransparentBg": bool(row["current_is_transparent"]),
                "fontWeight": row["current_font_weight"] if "current_font_weight" in row.keys() and row["current_font_weight"] else "bold",
                "fontStyle": row["current_font_style"] if "current_font_style" in row.keys() and row["current_font_style"] else "normal",
                "fontFamily": row["current_font_family"] if "current_font_family" in row.keys() and row["current_font_family"] else "Inter",
                "textAlign": row["current_text_align"] if "current_text_align" in row.keys() and row["current_text_align"] else "center",
                "opacity": row["current_opacity"] if "current_opacity" in row.keys() and row["current_opacity"] is not None else 1.0,
            },
            "nextBox": {
                "leftPct": row["next_left_pct"],
                "topPct": row["next_top_pct"],
                "widthPct": row["next_width_pct"],
                "heightPct": row["next_height_pct"],
                "fontSize": row["next_font_size"],
                "textColor": row["next_text_color"],
                "strokeColor": row["next_stroke_color"] if "next_stroke_color" in row.keys() and row["next_stroke_color"] else "transparent",
                "strokeWidth": row["next_stroke_width"] if "next_stroke_width" in row.keys() and row["next_stroke_width"] is not None else 0,
                "bgColor": row["next_bg_color"],
                "isTransparentBg": bool(row["next_is_transparent"]),
                "fontWeight": row["next_font_weight"] if "next_font_weight" in row.keys() and row["next_font_weight"] else "600",
                "fontStyle": row["next_font_style"] if "next_font_style" in row.keys() and row["next_font_style"] else "normal",
                "fontFamily": row["next_font_family"] if "next_font_family" in row.keys() and row["next_font_family"] else "Inter",
                "textAlign": row["next_text_align"] if "next_text_align" in row.keys() and row["next_text_align"] else "center",
                "opacity": row["next_opacity"] if "next_opacity" in row.keys() and row["next_opacity"] is not None else 1.0,
            },
            "customElements": custom_elements,
            "updatedAt": str(row["updated_at"]) if row["updated_at"] else None
        }

    def update_settings(self, settings: Dict[str, Any], setting_id: str = "default_profile") -> Dict[str, Any]:
        validate_monitor_settings(settings)

        existing = self.get_settings(setting_id)
        if not existing:
            init_monitor_db(self.db_path)
            existing = self.get_settings(setting_id)

        layout_mode = settings.get("layoutMode", existing["layoutMode"])
        cur_box = settings.get("currentBox", existing["currentBox"])
        nxt_box = settings.get("nextBox", existing["nextBox"])
        raw_custom = settings.get("customElements", existing.get("customElements", []))
        custom_elements_str = json.dumps(raw_custom)

        updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        conn = get_db_connection(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE monitor_settings SET
                layout_mode = ?,
                current_left_pct = ?,
                current_top_pct = ?,
                current_width_pct = ?,
                current_height_pct = ?,
                current_font_size = ?,
                current_text_color = ?,
                current_stroke_color = ?,
                current_stroke_width = ?,
                current_bg_color = ?,
                current_is_transparent = ?,
                current_font_weight = ?,
                current_font_style = ?,
                current_font_family = ?,
                current_text_align = ?,
                current_opacity = ?,
                next_left_pct = ?,
                next_top_pct = ?,
                next_width_pct = ?,
                next_height_pct = ?,
                next_font_size = ?,
                next_text_color = ?,
                next_stroke_color = ?,
                next_stroke_width = ?,
                next_bg_color = ?,
                next_is_transparent = ?,
                next_font_weight = ?,
                next_font_style = ?,
                next_font_family = ?,
                next_text_align = ?,
                next_opacity = ?,
                custom_elements = ?,
                updated_at = ?
            WHERE setting_id = ?
        """, (
            layout_mode,
            float(cur_box.get("leftPct", existing["currentBox"]["leftPct"])),
            float(cur_box.get("topPct", existing["currentBox"]["topPct"])),
            float(cur_box.get("widthPct", existing["currentBox"]["widthPct"])),
            float(cur_box.get("heightPct", existing["currentBox"]["heightPct"])),
            int(cur_box.get("fontSize", existing["currentBox"]["fontSize"])),
            str(cur_box.get("textColor", existing["currentBox"]["textColor"])),
            str(cur_box.get("strokeColor", existing["currentBox"].get("strokeColor", "transparent"))),
            int(cur_box.get("strokeWidth", existing["currentBox"].get("strokeWidth", 0))),
            str(cur_box.get("bgColor", existing["currentBox"]["bgColor"])),
            1 if cur_box.get("isTransparentBg", existing["currentBox"]["isTransparentBg"]) else 0,
            str(cur_box.get("fontWeight", existing["currentBox"].get("fontWeight", "bold"))),
            str(cur_box.get("fontStyle", existing["currentBox"].get("fontStyle", "normal"))),
            str(cur_box.get("fontFamily", existing["currentBox"].get("fontFamily", "Inter"))),
            str(cur_box.get("textAlign", existing["currentBox"].get("textAlign", "center"))),
            float(cur_box.get("opacity", existing["currentBox"].get("opacity", 1.0))),
            float(nxt_box.get("leftPct", existing["nextBox"]["leftPct"])),
            float(nxt_box.get("topPct", existing["nextBox"]["topPct"])),
            float(nxt_box.get("widthPct", existing["nextBox"]["widthPct"])),
            float(nxt_box.get("heightPct", existing["nextBox"]["heightPct"])),
            int(nxt_box.get("fontSize", existing["nextBox"]["fontSize"])),
            str(nxt_box.get("textColor", existing["nextBox"]["textColor"])),
            str(nxt_box.get("strokeColor", existing["nextBox"].get("strokeColor", "transparent"))),
            int(nxt_box.get("strokeWidth", existing["nextBox"].get("strokeWidth", 0))),
            str(nxt_box.get("bgColor", existing["nextBox"]["bgColor"])),
            1 if nxt_box.get("isTransparentBg", existing["nextBox"]["isTransparentBg"]) else 0,
            str(nxt_box.get("fontWeight", existing["nextBox"].get("fontWeight", "600"))),
            str(nxt_box.get("fontStyle", existing["nextBox"].get("fontStyle", "normal"))),
            str(nxt_box.get("fontFamily", existing["nextBox"].get("fontFamily", "Inter"))),
            str(nxt_box.get("textAlign", existing["nextBox"].get("textAlign", "center"))),
            float(nxt_box.get("opacity", existing["nextBox"].get("opacity", 1.0))),
            custom_elements_str,
            updated_at,
            setting_id
        ))
        conn.commit()
        conn.close()

        return self.get_settings(setting_id)

        return self.get_settings(setting_id)

def get_monitor_settings(db_path: Optional[str] = None, setting_id: str = "default_profile") -> Optional[Dict[str, Any]]:
    if db_path is None:
        db_path = DEFAULT_DB_PATH
    repo = MonitorSettingsRepository(db_path)
    return repo.get_settings(setting_id)

def update_monitor_settings(settings: Dict[str, Any], db_path: Optional[str] = None, setting_id: str = "default_profile") -> Dict[str, Any]:
    if db_path is None:
        db_path = DEFAULT_DB_PATH
    repo = MonitorSettingsRepository(db_path)
    return repo.update_settings(settings, setting_id)
