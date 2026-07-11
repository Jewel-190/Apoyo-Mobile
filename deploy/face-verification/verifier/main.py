"""
Self-hosted face verification for Apoyo registration.

- Compares selfie vs ID photo via CompreFace verification API.
- Liveness: multiple live frames + passive anti-spoof (DeepFace) + frame diversity.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from id_match import verify_id_document, warm_ocr

ML_MAX_SIDE = int(os.getenv("ML_MAX_SIDE", "640"))
VERIFY_TIMEOUT_SEC = float(os.getenv("VERIFY_TIMEOUT_SEC", "120"))
ID_VERIFY_TIMEOUT_SEC = float(os.getenv("ID_VERIFY_TIMEOUT_SEC", "90"))

COMPREFACE_API_URL = os.getenv("COMPREFACE_API_URL", "http://compreface-api:8080").rstrip("/")
COMPREFACE_API_KEY = os.getenv("COMPREFACE_API_KEY", "")
FACE_VERIFY_SERVICE_KEY = os.getenv("FACE_VERIFY_SERVICE_KEY", "")
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.85"))
LIVENESS_MIN_FRAMES = int(os.getenv("LIVENESS_MIN_FRAMES", "4"))
FRAME_MIN_HAMMING_DISTANCE = int(os.getenv("FRAME_MIN_HAMMING_DISTANCE", "2"))
POSE_MIN_YAW = float(os.getenv("POSE_MIN_YAW", "0.04"))
ANTI_SPOOF_ENABLED = os.getenv("ANTI_SPOOF_ENABLED", "true").lower() != "false"
BLINK_REQUIRED = os.getenv("BLINK_REQUIRED", "true").lower() != "false"
BLINK_MIN_EAR_DELTA = float(os.getenv("BLINK_MIN_EAR_DELTA", "0.015"))
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(15 * 1024 * 1024)))

_LEFT_EYE = (33, 160, 158, 133, 153, 144)
_RIGHT_EYE = (362, 385, 387, 263, 373, 380)
_face_mesh = None
_models_warmed = False


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Warm ML models in the background so the first /verify is not a multi-minute cold start.
    asyncio.create_task(asyncio.to_thread(_warm_models))
    yield


app = FastAPI(title="Apoyo Face Verifier", version="1.0.0", lifespan=_lifespan)


class VerifyRequest(BaseModel):
    id_image_base64: str
    selfie_image_base64: str
    liveness_frames_base64: list[str] = Field(default_factory=list)
    pose_labels: list[str] = Field(default_factory=list)


class VerifyIdRequest(BaseModel):
    id_image_base64: str
    profile: dict[str, Any] = Field(default_factory=dict)


class IdCheckResult(BaseModel):
    field: str
    label: str
    matched: bool
    score: float
    expected: str


class VerifyIdResponse(BaseModel):
    ok: bool = True
    verified: bool = False
    error: str | None = None
    code: str | None = None
    checks: list[dict[str, Any]] = Field(default_factory=list)
    ocr_preview: str | None = None


class VerifyResponse(BaseModel):
    ok: bool = True
    verified: bool = False
    liveness_passed: bool = False
    similarity: float = 0.0
    threshold: float = SIMILARITY_THRESHOLD
    error: str | None = None
    code: str | None = None


def _strip_data_url(b64: str) -> str:
    t = b64.strip()
    idx = t.find("base64,")
    if idx != -1:
        return t[idx + 7 :].replace("\n", "").replace("\r", "").replace(" ", "")
    return t.replace("\n", "").replace("\r", "").replace(" ", "")


def _decode_image(b64: str) -> bytes:
    try:
        raw = base64.b64decode(_strip_data_url(b64), validate=True)
    except Exception as exc:
        raise ValueError("Invalid base64 image") from exc
    if len(raw) < 100:
        raise ValueError("Image too small")
    if len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("Image too large")
    return raw


def _resize_for_ml(image_bytes: bytes, max_side: int = ML_MAX_SIDE) -> bytes:
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes))
    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _warm_models() -> None:
    global _models_warmed
    if _models_warmed:
        return
    started = time.perf_counter()
    try:
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (224, 224), color=(128, 128, 128)).save(buf, format="JPEG")
        tiny = buf.getvalue()
        _get_face_mesh().process(np.zeros((224, 224, 3), dtype=np.uint8))
        _frame_eye_aspect_ratio(tiny)
        if ANTI_SPOOF_ENABLED:
            _anti_spoof_real(tiny)
        try:
            warm_ocr()
        except Exception as ocr_exc:
            print("ocr_warmup_error", str(ocr_exc))
        _models_warmed = True
        print("models_warmed", round(time.perf_counter() - started, 2), "s")
    except Exception as exc:
        print("model_warmup_error", str(exc))


def _ahash(image_bytes: bytes, size: int = 16) -> int:
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    # Center crop so blinks / small motion affect the hash more than background JPEG noise.
    w, h = img.size
    left, top = int(w * 0.2), int(h * 0.12)
    right, bottom = int(w * 0.8), int(h * 0.88)
    img = img.crop((left, top, right, bottom)).resize((size, size))
    pixels = list(img.getdata())
    avg = sum(pixels) / len(pixels)
    bits = 0
    for i, px in enumerate(pixels):
        if px >= avg:
            bits |= 1 << i
    return bits


def _hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def _get_face_mesh():
    global _face_mesh
    if _face_mesh is None:
        import mediapipe as mp

        _face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
        )
    return _face_mesh


def _ear_for_eye(landmarks: Any, indices: tuple[int, ...], width: int, height: int) -> float | None:
    pts = np.array([(landmarks[i].x * width, landmarks[i].y * height) for i in indices], dtype=np.float32)
    vertical_1 = np.linalg.norm(pts[1] - pts[5])
    vertical_2 = np.linalg.norm(pts[2] - pts[4])
    horizontal = np.linalg.norm(pts[0] - pts[3])
    if horizontal < 1e-6:
        return None
    return float((vertical_1 + vertical_2) / (2.0 * horizontal))


def _frame_eye_aspect_ratio(image_bytes: bytes) -> float | None:
    import cv2

    nparr = np.frombuffer(_resize_for_ml(image_bytes), np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    height, width = rgb.shape[:2]
    result = _get_face_mesh().process(rgb)
    if not result.multi_face_landmarks:
        return None

    landmarks = result.multi_face_landmarks[0].landmark
    left = _ear_for_eye(landmarks, _LEFT_EYE, width, height)
    right = _ear_for_eye(landmarks, _RIGHT_EYE, width, height)
    if left is None or right is None:
        return None
    return (left + right) / 2.0


def _estimate_head_yaw(image_bytes: bytes) -> float | None:
    import cv2

    nparr = np.frombuffer(_resize_for_ml(image_bytes), np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    result = _get_face_mesh().process(rgb)
    if not result.multi_face_landmarks:
        return None

    landmarks = result.multi_face_landmarks[0].landmark
    nose = landmarks[1]
    left = landmarks[234]
    right = landmarks[454]
    width = abs(right.x - left.x)
    if width < 1e-6:
        return None
    center = (left.x + right.x) / 2.0
    return float((nose.x - center) / width)


def _check_pose_sequence(frames: list[bytes], labels: list[str]) -> tuple[bool, str | None]:
    if not labels:
        return True, None

    yaws_by_label: dict[str, list[float]] = {}
    for label, frame in zip(labels, frames):
        yaw = _estimate_head_yaw(frame)
        if yaw is None:
            continue
        yaws_by_label.setdefault(label.strip().lower(), []).append(yaw)

    if len(yaws_by_label) < 2:
        return False, "NO_FACE"

    # Mirrored front cameras vary by device — require left vs right to differ, not fixed yaw signs.
    left_yaws = yaws_by_label.get("left", [])
    right_yaws = yaws_by_label.get("right", [])
    if left_yaws and right_yaws:
        left_avg = sum(left_yaws) / len(left_yaws)
        right_avg = sum(right_yaws) / len(right_yaws)
        if abs(left_avg - right_avg) < POSE_MIN_YAW:
            print("liveness_fail", "pose_lr_delta", round(abs(left_avg - right_avg), 4))
            return False, "POSE_MISMATCH"

    front_yaws = yaws_by_label.get("front", [])
    if front_yaws and left_yaws:
        front_avg = sum(front_yaws) / len(front_yaws)
        left_avg = sum(left_yaws) / len(left_yaws)
        if abs(front_avg - left_avg) < POSE_MIN_YAW * 0.75:
            print("liveness_fail", "pose_front_left", round(abs(front_avg - left_avg), 4))
            return False, "POSE_MISMATCH"

    return True, None


def _uses_pose_challenge(labels: list[str] | None) -> bool:
    if not labels:
        return False
    normalized = {label.strip().lower() for label in labels}
    return "left" in normalized and "right" in normalized


def _blink_detected(frames: list[bytes]) -> tuple[bool, str | None]:
    if not BLINK_REQUIRED:
        return True, None

    ears = [_frame_eye_aspect_ratio(frame) for frame in frames]
    valid = [ear for ear in ears if ear is not None]
    if len(valid) < 2:
        return False, "NO_FACE"

    ear_delta = max(valid) - min(valid)
    if ear_delta < BLINK_MIN_EAR_DELTA:
        print("liveness_fail", "no_blink", round(ear_delta, 4), BLINK_MIN_EAR_DELTA)
        return False, "BLINK_REQUIRED"
    return True, None


def _anti_spoof_real(image_bytes: bytes) -> tuple[bool, str | None]:
    if not ANTI_SPOOF_ENABLED:
        return True, None
    try:
        import cv2
        from deepface import DeepFace

        nparr = np.frombuffer(_resize_for_ml(image_bytes), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return False, "INVALID_IMAGE"

        faces = DeepFace.extract_faces(
            img_path=img,
            anti_spoofing=True,
            enforce_detection=False,
        )
        if not faces:
            return False, "NO_FACE"
        for face in faces:
            if not bool(face.get("is_real", True)):
                return False, "SPOOF_DETECTED"
        return True, None
    except Exception as exc:
        # If model fails, fail closed in production; log for ops.
        print("anti_spoof_error", str(exc))
        return False, "ANTI_SPOOF_ERROR"


async def _compreface_verify(source: bytes, target: bytes) -> tuple[float, str | None]:
    if not COMPREFACE_API_KEY:
        return 0.0, "COMPREFACE_API_KEY not configured"

    url = f"{COMPREFACE_API_URL}/api/v1/verification/verify"
    files = {
        "source_image": ("source.jpg", source, "image/jpeg"),
        "target_image": ("target.jpg", target, "image/jpeg"),
    }
    headers = {"x-api-key": COMPREFACE_API_KEY}

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(url, headers=headers, files=files)

    if res.status_code >= 400:
        text = res.text[:500]
        print("compreface_error", res.status_code, text)
        if "No face" in text or "no face" in text.lower():
            return 0.0, "NO_FACE"
        return 0.0, "COMPREFACE_ERROR"

    data: dict[str, Any] = res.json()
    result = data.get("result") or []
    if not result:
        return 0.0, "NO_FACE"

    best = 0.0
    for item in result:
        for match in item.get("face_matches") or []:
            sim = float(match.get("similarity") or 0.0)
            if sim > best:
                best = sim
    return best / 100.0 if best > 1 else best, None


def _check_liveness_frames(frames: list[bytes], pose_labels: list[str] | None = None) -> tuple[bool, str | None]:
    if len(frames) < LIVENESS_MIN_FRAMES:
        return False, "LIVENESS_FRAMES_REQUIRED"

    digests = [hashlib.sha256(f).hexdigest() for f in frames]
    if len(set(digests)) < len(digests):
        print("liveness_fail", "identical_frame_bytes")
        return False, "STATIC_REPLAY"

    pose_ok, pose_code = _check_pose_sequence(frames, pose_labels or [])
    if not pose_ok:
        return False, pose_code

    hashes = [_ahash(f) for f in frames]
    pair_dists = [
        _hamming(hashes[i], hashes[j])
        for i in range(len(hashes))
        for j in range(i + 1, len(hashes))
    ]
    # Require at least one pair of frames to differ (blink / micro-motion), not every pair.
    max_dist = max(pair_dists) if pair_dists else 0
    if max_dist < FRAME_MIN_HAMMING_DISTANCE:
        print("liveness_fail", "low_frame_diversity", max_dist, FRAME_MIN_HAMMING_DISTANCE)
        return False, "STATIC_REPLAY"

    blink_ok, blink_code = (True, None)
    if not _uses_pose_challenge(pose_labels):
        blink_ok, blink_code = _blink_detected(frames)
    if not blink_ok:
        return False, blink_code

    # Anti-spoof is expensive on CPU — check middle pose + final selfie frame.
    mid_idx = min(1, len(frames) - 1)
    spoof_targets = [frames[mid_idx], frames[-1]]
    seen: set[bytes] = set()
    for frame in spoof_targets:
        digest = hashlib.sha256(frame).digest()
        if digest in seen:
            continue
        seen.add(digest)
        real, code = _anti_spoof_real(frame)
        if not real:
            print("liveness_fail", "anti_spoof", code)
            return False, code or "SPOOF_DETECTED"

    return True, None


def _auth_or_403(api_key: str | None) -> None:
    if not FACE_VERIFY_SERVICE_KEY:
        raise HTTPException(status_code=503, detail="Service key not configured")
    if api_key != FACE_VERIFY_SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/verify-id", response_model=VerifyIdResponse)
async def verify_id(
    body: VerifyIdRequest,
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
) -> VerifyIdResponse:
    _auth_or_403(x_api_key)

    try:
        id_bytes = _decode_image(body.id_image_base64)
    except ValueError as exc:
        return VerifyIdResponse(ok=False, error=str(exc), code="INVALID_IMAGE")

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(verify_id_document, id_bytes, body.profile),
            timeout=ID_VERIFY_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        return VerifyIdResponse(
            ok=False,
            error="ID verification timed out. Try again with a clearer photo.",
            code="TIMEOUT",
        )

    return VerifyIdResponse(**result)


@app.post("/verify", response_model=VerifyResponse)
async def verify(
    body: VerifyRequest,
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
) -> VerifyResponse:
    _auth_or_403(x_api_key)

    try:
        id_bytes = _decode_image(body.id_image_base64)
        selfie_bytes = _decode_image(body.selfie_image_base64)
        frame_bytes = [_decode_image(f) for f in body.liveness_frames_base64]
    except ValueError as exc:
        return VerifyResponse(ok=False, error=str(exc), code="INVALID_IMAGE")

    if len(frame_bytes) < LIVENESS_MIN_FRAMES:
        return VerifyResponse(
            ok=False,
            error=f"Provide at least {LIVENESS_MIN_FRAMES} live camera frames.",
            code="LIVENESS_FRAMES_REQUIRED",
        )

    started = time.perf_counter()
    try:
        liveness_ok, liveness_code = await asyncio.wait_for(
            asyncio.to_thread(_check_liveness_frames, frame_bytes, body.pose_labels),
            timeout=VERIFY_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        print("verify_timeout", VERIFY_TIMEOUT_SEC)
        return VerifyResponse(
            ok=False,
            error="Verification timed out. The server is still loading models—wait 30 seconds and try again.",
            code="TIMEOUT",
        )

    if not liveness_ok:
        static_replay_msg = (
            "Live check failed. Wait for each countdown and capture a new photo at each angle—not a still image or replay."
            if _uses_pose_challenge(body.pose_labels)
            else "Live check failed. Please blink and try again without holding a photo to the camera."
        )
        msg = {
            "SPOOF_DETECTED": "Live check failed. Use your real face in good lighting—not a photo or screen.",
            "NO_FACE": "Could not detect a clear face during the live check.",
            "STATIC_REPLAY": static_replay_msg,
            "BLINK_REQUIRED": "Live check failed. Blink clearly once during capture—printed photos and screens are not accepted.",
            "POSE_MISMATCH": "Live check failed. Follow each head-turn prompt (left, right, then straight).",
            "ANTI_SPOOF_ERROR": "Live check is temporarily unavailable. Try again shortly.",
        }.get(liveness_code or "", "Live check failed. Please try again.")
        return VerifyResponse(ok=True, verified=False, liveness_passed=False, error=msg, code=liveness_code)

    print("verify_liveness_done", round(time.perf_counter() - started, 2), "s")
    similarity, cf_code = await _compreface_verify(selfie_bytes, id_bytes)
    if cf_code == "NO_FACE":
        return VerifyResponse(
            ok=False,
            error="Could not detect a clear face on your ID or selfie. Retake both in good lighting.",
            code="NO_FACE",
        )
    if cf_code:
        return VerifyResponse(ok=False, error="Face comparison service error.", code=cf_code)

    verified = similarity >= SIMILARITY_THRESHOLD
    if not verified:
        return VerifyResponse(
            ok=True,
            verified=False,
            liveness_passed=True,
            similarity=round(similarity, 4),
            threshold=SIMILARITY_THRESHOLD,
            error="Face did not match your ID photo.",
            code="FACE_MISMATCH",
        )

    return VerifyResponse(
        ok=True,
        verified=True,
        liveness_passed=True,
        similarity=round(similarity, 4),
        threshold=SIMILARITY_THRESHOLD,
    )
