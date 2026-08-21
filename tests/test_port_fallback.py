import socket
import pytest
from run import is_port_available, find_available_port

def test_is_port_available_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as temp_s:
        temp_s.bind(('127.0.0.1', 0))
        free_port = temp_s.getsockname()[1]
    
    assert is_port_available("127.0.0.1", free_port) is True

def test_find_available_port_fallback_when_occupied():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied_s:
        occupied_s.bind(('127.0.0.1', 0))
        occupied_port = occupied_s.getsockname()[1]
        
        assert is_port_available("127.0.0.1", occupied_port) is False
        
        next_port = find_available_port("127.0.0.1", occupied_port)
        assert next_port != occupied_port
        assert next_port > occupied_port
