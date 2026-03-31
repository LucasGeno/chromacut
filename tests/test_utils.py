import pytest

from chromacut.utils import sanitize_name


@pytest.mark.parametrize("input_name,expected", [
    ("icon-1", "icon-1"),
    ("../../../etc/owned", "etcowned"),
    ("..\\..\\etc\\owned", "etcowned"),
    ("...hidden", "hidden"),
    ("  .dots. ", "dots"),
    ("", "icon"),
    ("normal-name", "normal-name"),
    ("path/to/file", "pathtofile"),
    ("back\\slash", "backslash"),
])
def test_sanitize_name(input_name, expected):
    assert sanitize_name(input_name) == expected
