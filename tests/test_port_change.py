import pytest
from run import clean_port_input, is_port_available, find_available_port

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
