import re

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


@pytest.mark.parametrize("hostile", [
    'a\r\nX-Injected: 1',          # CRLF header injection
    'icon"; filename="evil',       # Content-Disposition quote/spoof
    'name;rm -rf',                 # semicolon
    'tab\tname',                   # control char
    'null\x00byte',                # null byte
    'spaced name',                 # whitespace
])
def test_sanitize_name_strips_header_injection_chars(hostile):
    """Output must be a strict [A-Za-z0-9._-] allowlist (or the 'icon' fallback) so
    it's safe to interpolate into a Content-Disposition header and zip entry name."""
    out = sanitize_name(hostile)
    assert re.fullmatch(r"[A-Za-z0-9._-]+", out), f"unsafe chars survived: {out!r}"
