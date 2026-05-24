"""Shared utilities for chromacut."""

import re


def sanitize_name(name: str) -> str:
    """Sanitize a user-provided filename: prevent path traversal AND header injection.

    The result is interpolated into a Content-Disposition header and used as a zip
    entry name, so reduce to a strict allowlist (alphanumerics, dot, underscore,
    hyphen) — this also drops CR/LF, quotes, ';' and null bytes that could split or
    spoof the header — then collapse any '..' run and trim leading/trailing dots.
    """
    name = re.sub(r"[^A-Za-z0-9._-]", "", name)
    name = re.sub(r"\.\.+", "", name)
    name = name.strip(". ")
    return name or "icon"
