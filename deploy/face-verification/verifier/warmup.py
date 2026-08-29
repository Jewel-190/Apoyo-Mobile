"""Rules for CompreFace first-request warmup (no heavy ML imports)."""

from __future__ import annotations

WARMUP_ROUNDS = 2

# Codes that mean the HTTP round-trip finished and workers likely loaded weights.
_WARM_OK_CODES = {None, "NO_FACE"}


def compreface_warmup_succeeded(code: str | None) -> bool:
    return code in _WARM_OK_CODES
