import os
import shutil
import socket
from pathlib import Path


def copy_missing_tree(source, destination):
    """Seed legacy app files without replacing files already in AppData."""
    source_path = Path(source)
    destination_path = Path(destination)
    if not source_path.is_dir():
        return
    for root, _dirs, files in os.walk(source_path):
        relative = Path(root).relative_to(source_path)
        target_dir = destination_path / relative
        target_dir.mkdir(parents=True, exist_ok=True)
        for filename in files:
            source_file = Path(root) / filename
            target_file = target_dir / filename
            if not target_file.exists():
                try:
                    shutil.copy2(source_file, target_file)
                except FileExistsError:
                    # Another startup process may have created the destination first.
                    pass


def is_port_available(host: str, port: int) -> bool:
    """Check whether a socket can bind on the requested host and port."""
    check_hosts = [host] if host not in ["0.0.0.0", ""] else ["127.0.0.1", "0.0.0.0"]
    for check_host in check_hosts:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind((check_host, port))
        except Exception:
            return False
    return True


def find_available_port(host: str, preferred_port: int, max_attempts: int = 50) -> int:
    """Try the preferred port, then the next available port in a bounded range."""
    if is_port_available(host, preferred_port):
        return preferred_port
    for offset in range(1, max_attempts + 1):
        candidate = preferred_port + offset
        if candidate <= 65535 and is_port_available(host, candidate):
            return candidate
    return preferred_port


def clean_port_input(raw_output: str) -> int | None:
    """Parse a valid configured port from PowerShell output."""
    if not raw_output:
        return None
    cleaned = raw_output.replace("\ufeff", "").strip()
    if cleaned.isdigit():
        value = int(cleaned)
        if 1024 <= value <= 65535:
            return value
    return None
