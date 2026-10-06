"""
PoC face service for the VMS baseline.

Implements the SDD contract: detection, quality, a two-frame liveness stand-in,
template reference storage, and 1:1 verification. Raw templates are never returned.

The model and threshold are not production sign-off items. See open decision OD-04.
Set FACE_DETECTOR=haar|center|auto. auto uses Haar when OpenCV is installed.
"""

from __future__ import annotations

import base64
import json
import os
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

POLICY_VERSION = "poc-embedding-1"
THRESHOLD = float(os.environ.get("MATCH_THRESHOLD", "0.82"))
DATA = Path(os.environ.get("FACE_DATA_DIR", Path(__file__).resolve().parent / "data"))
STORE = DATA / "templates.json"

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None

app = FastAPI(title="VMS Face Service", version="1.0")


class FrameRequest(BaseModel):
    image_a: str
    image_b: str | None = None
    subject_ref: str | None = None
    template_ref: str | None = None
    liveness_required: bool = True


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_store() -> dict:
    if not STORE.exists():
        return {}
    return json.loads(STORE.read_text(encoding="utf-8"))


def save_store(store: dict) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(store), encoding="utf-8")


def decode_image(payload: str) -> Image.Image:
    if not payload:
        raise HTTPException(status_code=400, detail={"code": "BAD_IMAGE", "message": "Image payload is empty."})
    raw = payload.split(",", 1)[1] if payload.startswith("data:") else payload
    try:
        binary = base64.b64decode(raw, validate=False)
        image = Image.open(BytesIO(binary)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail={"code": "BAD_IMAGE", "message": "Image could not be decoded."}) from exc
    image.thumbnail((960, 960))
    return image


def detector_mode() -> str:
    mode = os.environ.get("FACE_DETECTOR", "auto").lower()
    if mode == "auto":
        return "haar" if cv2 is not None else "center"
    return mode


def detect_box(image: Image.Image):
    mode = detector_mode()
    width, height = image.size
    if mode == "center" or cv2 is None:
        side = int(min(width, height) * 0.62)
        x = max(0, (width - side) // 2)
        y = max(0, (height - side) // 2)
        return (x, y, side, side), mode
    array = np.asarray(image.convert("L"))
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(array, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48))
    if len(faces) == 0:
        return None, mode
    x, y, w, h = max(faces, key=lambda box: box[2] * box[3])
    return (int(x), int(y), int(w), int(h)), mode


def analyze(image: Image.Image):
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    brightness = float(gray.mean())
    variance = float(gray.var())
    box, mode = detect_box(image)
    if box is None:
        return {
            "ok": False,
            "reason": "NO_FACE",
            "quality": 0.0,
            "vector": None,
            "preview": None,
            "detector": mode,
        }
    x, y, w, h = box
    if w < 40 or h < 40:
        return {"ok": False, "reason": "POOR_QUALITY", "quality": 10.0, "vector": None, "preview": None, "detector": mode}
    crop = gray[y : y + h, x : x + w]
    crop_image = Image.fromarray(crop.astype(np.uint8)).resize((32, 32))
    small = np.asarray(crop_image, dtype=np.float32)
    usable = 45 <= brightness <= 220 and variance >= 80
    quality = float(max(0, min(100, (variance / 25) if usable else variance / 80)))
    if not usable:
        return {"ok": False, "reason": "POOR_QUALITY", "quality": quality, "vector": None, "preview": small, "detector": mode}
    vector = small.flatten()
    norm = float(np.linalg.norm(vector)) + 1e-8
    vector = vector / norm
    return {"ok": True, "reason": "OK", "quality": quality, "vector": vector, "preview": small, "detector": mode}


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / ((np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8))


def liveness(first, second, required: bool):
    if not required:
        return True, "OK"
    if second is None or second.get("preview") is None or first.get("preview") is None:
        return False, "LIVENESS_FAILED"
    if not first["ok"] or not second["ok"]:
        return False, first["reason"] if not first["ok"] else second["reason"]
    diff = float(np.mean(np.abs(first["preview"] - second["preview"])))
    same = cosine(first["vector"], second["vector"]) >= 0.9
    # Identical frames are rejected. A small natural change between two captures passes.
    if same and diff >= 0.35:
        return True, "OK"
    return False, "LIVENESS_FAILED"


def result_body(**kwargs):
    kwargs.setdefault("threshold", THRESHOLD)
    kwargs.setdefault("policy_version", POLICY_VERSION)
    return kwargs


@app.get("/health")
def health():
    return {"status": "ok", "detector": detector_mode(), "policy": POLICY_VERSION, "threshold": THRESHOLD}


@app.post("/face/enroll")
def enroll(body: FrameRequest):
    first = analyze(decode_image(body.image_a))
    second = analyze(decode_image(body.image_b)) if body.image_b else None
    if not first["ok"]:
        return result_body(accepted=False, template_ref=None, quality_score=first["quality"], liveness_passed=False, reason=first["reason"], match=False, score=0)
    live, live_reason = liveness(first, second, body.liveness_required)
    if not live:
        return result_body(
            accepted=False,
            template_ref=None,
            quality_score=first["quality"],
            liveness_passed=False,
            reason=live_reason,
            match=False,
            score=0,
        )
    template_ref = str(uuid.uuid4())
    store = load_store()
    store[template_ref] = {
        "vector": first["vector"].tolist(),
        "subject_ref": body.subject_ref,
        "created_at": utcnow(),
        "policy_version": POLICY_VERSION,
    }
    save_store(store)
    return result_body(
        accepted=True,
        template_ref=template_ref,
        quality_score=round(first["quality"], 2),
        liveness_passed=True,
        reason="OK",
        match=True,
        score=1,
    )


@app.post("/face/verify")
def verify(body: FrameRequest):
    if not body.template_ref:
        raise HTTPException(status_code=400, detail={"code": "TEMPLATE_REQUIRED", "message": "template_ref is required."})
    store = load_store()
    record = store.get(body.template_ref)
    if not record:
        return result_body(match=False, score=0, quality_score=0, liveness_passed=False, reason="TEMPLATE_NOT_FOUND", accepted=False)
    first = analyze(decode_image(body.image_a))
    second = analyze(decode_image(body.image_b)) if body.image_b else None
    if not first["ok"]:
        return result_body(match=False, score=0, quality_score=first["quality"], liveness_passed=False, reason=first["reason"], accepted=False)
    live, live_reason = liveness(first, second, body.liveness_required)
    if body.liveness_required and not live:
        return result_body(
            match=False,
            score=0,
            quality_score=round(first["quality"], 2),
            liveness_passed=False,
            reason=live_reason,
            accepted=False,
        )
    score = cosine(first["vector"], np.asarray(record["vector"], dtype=np.float32))
    matched = score >= THRESHOLD
    return result_body(
        match=matched,
        score=round(score, 4),
        quality_score=round(first["quality"], 2),
        liveness_passed=live,
        reason="MATCH" if matched else "MISMATCH",
        accepted=matched,
    )


@app.post("/face/quality")
def quality(body: FrameRequest):
    first = analyze(decode_image(body.image_a))
    return result_body(accepted=first["ok"], reason=first["reason"], quality_score=first["quality"], detector=first["detector"])


@app.delete("/face/templates/{template_ref}")
def delete_template(template_ref: str):
    store = load_store()
    existed = store.pop(template_ref, None) is not None
    save_store(store)
    return {"deleted": existed}


