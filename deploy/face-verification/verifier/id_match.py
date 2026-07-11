"""Self-hosted ID OCR + practical fuzzy match against registration profile."""

from __future__ import annotations

import io
import os
import re
from typing import Any

import cv2
import numpy as np
from rapidfuzz import fuzz

_ocr_reader = None
OCR_MAX_SIDE = int(os.getenv("OCR_MAX_SIDE", "1600"))
NAME_MATCH_THRESHOLD = int(os.getenv("ID_NAME_MATCH_THRESHOLD", "72"))


def _get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr

        _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _ocr_reader


def normalize_text(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def _decode_image_bytes(image_bytes: bytes) -> np.ndarray | None:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    height, width = img.shape[:2]
    if max(height, width) > OCR_MAX_SIDE:
        scale = OCR_MAX_SIDE / max(height, width)
        img = cv2.resize(img, (int(width * scale), int(height * scale)))
    return img


def extract_id_text(image_bytes: bytes) -> str:
    img = _decode_image_bytes(image_bytes)
    if img is None:
        return ""
    lines = _get_ocr_reader().readtext(img, detail=0, paragraph=True)
    return " ".join(str(line) for line in lines if line).strip()


def _name_match(name: str, text: str, norm_text: str) -> tuple[bool, float]:
    cleaned = name.strip()
    if not cleaned or len(cleaned) < 2:
        return True, 100.0

    token = normalize_text(cleaned)
    if token in norm_text:
        return True, 100.0

    best = 0.0
    for word in re.findall(r"[A-Za-z]{2,}", text):
        best = max(best, float(fuzz.ratio(token, normalize_text(word))))

    window = max(len(token), 4)
    for i in range(0, max(1, len(norm_text) - window + 1), 2):
        chunk = norm_text[i : i + window + 6]
        best = max(best, float(fuzz.partial_ratio(token, chunk)))

    return best >= NAME_MATCH_THRESHOLD, best


def _birth_match(birth_date: str, text: str, norm_text: str) -> tuple[bool, float]:
    if not birth_date.strip():
        return True, 100.0

    parts = birth_date.strip().split("-")
    if len(parts) != 3:
        return False, 0.0

    year, month, day = parts
    candidates = [
        birth_date,
        birth_date.replace("-", "/"),
        birth_date.replace("-", "."),
        f"{month}/{day}/{year}",
        f"{day}/{month}/{year}",
        f"{month}-{day}-{year}",
        f"{day}-{month}-{year}",
        f"{year}{month}{day}",
    ]
    for candidate in candidates:
        if normalize_text(candidate) in norm_text or candidate in text:
            return True, 100.0

    if year in text and (month.lstrip("0") in text or day.lstrip("0") in text):
        return True, 75.0

    return False, 0.0


def _voter_id_match(voter_id: str, text: str) -> tuple[bool, float]:
    if not voter_id.strip():
        return True, 100.0

    expected = re.sub(r"\D", "", voter_id)
    found = re.sub(r"\D", "", text)
    if not expected:
        return True, 100.0
    if expected in found:
        return True, 100.0
    if len(expected) >= 10 and expected[-10:] in found:
        return True, 88.0
    if len(expected) >= 6 and expected[-6:] in found:
        return True, 75.0
    return False, 0.0


def verify_id_document(image_bytes: bytes, profile: dict[str, Any]) -> dict[str, Any]:
    text = extract_id_text(image_bytes)
    norm_text = normalize_text(text)

    if len(norm_text) < 8:
        return {
            "ok": False,
            "verified": False,
            "error": "Could not read text on your ID. Retake the photo in good lighting with the full card visible.",
            "code": "OCR_FAILED",
            "checks": [],
            "ocr_preview": text[:400],
        }

    first_name = str(profile.get("first_name") or "")
    middle_name = str(profile.get("middle_name") or "")
    last_name = str(profile.get("last_name") or "")
    no_middle = bool(profile.get("no_middle"))
    birth_date = str(profile.get("birth_date") or "")
    voter_id = str(profile.get("voter_id") or "")

    fn_ok, fn_score = _name_match(first_name, text, norm_text)
    ln_ok, ln_score = _name_match(last_name, text, norm_text)
    mn_ok, mn_score = (
        (True, 100.0) if no_middle or not middle_name.strip() else _name_match(middle_name, text, norm_text)
    )
    birth_ok, birth_score = _birth_match(birth_date, text, norm_text)
    voter_ok, voter_score = _voter_id_match(voter_id, text)

    checks = [
        {"field": "first_name", "label": "First name", "matched": fn_ok, "score": round(fn_score, 1), "expected": first_name},
        {"field": "last_name", "label": "Last name", "matched": ln_ok, "score": round(ln_score, 1), "expected": last_name},
        {"field": "birth_date", "label": "Birth date", "matched": birth_ok, "score": round(birth_score, 1), "expected": birth_date},
        {"field": "voter_id", "label": "Voter ID", "matched": voter_ok, "score": round(voter_score, 1), "expected": voter_id},
    ]
    if middle_name.strip() and not no_middle:
        checks.insert(
            2,
            {
                "field": "middle_name",
                "label": "Middle name",
                "matched": mn_ok,
                "score": round(mn_score, 1),
                "expected": middle_name,
            },
        )

    names_ok = fn_ok and ln_ok and mn_ok
    supporting_ok = birth_ok or voter_ok
    strong_names = fn_score >= 85 and ln_score >= 85

    verified = names_ok and (supporting_ok or strong_names)

    if not verified:
        failed = [c["label"] for c in checks if not c["matched"]]
        return {
            "ok": True,
            "verified": False,
            "error": (
                "Some ID details don't match your registration info"
                + (f" ({', '.join(failed)})" if failed else "")
                + ". Check the photo is clear and belongs to you."
            ),
            "code": "ID_MISMATCH",
            "checks": checks,
            "ocr_preview": text[:400],
        }

    return {
        "ok": True,
        "verified": True,
        "checks": checks,
        "ocr_preview": text[:400],
    }


def warm_ocr() -> None:
    buf = io.BytesIO()
    from PIL import Image

    Image.new("RGB", (320, 200), color=(240, 240, 240)).save(buf, format="JPEG")
    extract_id_text(buf.getvalue())
