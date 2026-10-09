from backend.services.launcher_utils import clean_port_input, is_port_available, find_available_port

def test_clean_port_input_valid():
    assert clean_port_input("8080") == 8080
    assert clean_port_input("  8080  \n") == 8080
    assert clean_port_input("1024") == 1024
    assert clean_port_input("65535") == 65535

def test_clean_port_input_with_bom():
    # UTF-8 BOM (\ufeff) 포함 시에도 정상 정제되는지 확인
    assert clean_port_input("\ufeff8080") == 8080
    assert clean_port_input("\ufeff  9000 \r\n") == 9000

def test_clean_port_input_invalid():
    assert clean_port_input("") is None
    assert clean_port_input(None) is None
    assert clean_port_input("abc") is None
    assert clean_port_input("8080a") is None
    assert clean_port_input("80") is None  # 1024 미만
    assert clean_port_input("0") is None
    assert clean_port_input("-8080") is None
    assert clean_port_input("65536") is None  # 65535 초과
    assert clean_port_input("70000") is None

def test_find_available_port_moves_off_an_occupied_configured_port():
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
        occupied.bind(("127.0.0.1", 0))
        occupied.listen(1)
        configured_port = occupied.getsockname()[1]
        chosen = find_available_port("127.0.0.1", configured_port, max_attempts=10)

    assert chosen != configured_port
    assert 1 <= chosen <= 65535
    assert is_port_available("127.0.0.1", chosen)

def test_cancelled_or_invalid_port_input_does_not_produce_a_port():
    for raw in ("", "\n", "  ", "80", "65536", "not a port"):
        assert clean_port_input(raw) is None
