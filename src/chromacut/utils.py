"""Shared utilities for chromacut."""

import re


def sanitize_name(name: str) -> str:
    """Sanitize a user-provided filename to prevent path traversal."""
    name = name.replace("/", "").replace("\\", "")
    name = re.sub(r"\.\.+", "", name)
    name = name.strip(". ")
    return name or "icon"
