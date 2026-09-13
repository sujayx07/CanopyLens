"""
gemini_counter.py — Stealth Gemini Vision Tree Detection & Verification Service
==============================================================================

Uses Google Gemini Vision API to perform an independent, high-fidelity
verification of the total tree crown count in aerial/drone imagery.

Features:
- Encapsulates Gemini Vision API via lightweight `httpx` (no heavy Google SDK needed).
- Reads `GEMINI_API_KEY` or `GOOGLE_API_KEY` from environment or backend/.env.
- Scales image to optimal dimensions (max 2048px) and encodes as base64 JPEG.
- Formulates a specialized forestry remote sensing prompt.
- Requests strict JSON response containing `tree_count`, `confidence`, and `reasoning`.
- Returns `None` gracefully if API key is missing or request encounters any error,
  ensuring zero disruption to the primary computer vision / SAM2 pipeline.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

# Supported Gemini vision models (optimized for low-latency aerial scene counting)
GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"]
GEMINI_ENDPOINT_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
)

FORESTRY_PROMPT = """You are an expert remote sensing forestry surveyor and aerial image analyst.
Carefully examine this aerial/drone imagery to identify and count ALL individual tree crowns visible in the scene.

Guidelines:
1. Count each distinct, individual tree crown or planted fruit tree/canopy.
2. In orchards, meadows, or groves with scattered trees, count each individual tree position methodically.
3. In clusters, separate adjacent individual tree centers where canopy crowns meet.
4. Distinguish between actual tree crowns and flat ground, grass patches, or shadow artifacts.

Respond ONLY with a JSON object in this exact schema:
{
  "tree_count": <integer total number of trees>,
  "confidence": <float between 0.0 and 1.0>,
  "density": <"isolated" | "sparse" | "dense">,
  "reasoning": "<concise 1-2 sentence description of identified tree crowns>"
}"""


def _get_api_key() -> Optional[str]:
    """Retrieve Gemini API key from environment variables or .env file."""
    # 1. Check current process environment
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if key and key.strip():
        return key.strip()

    # 2. Check backend/.env file
    possible_env_files = [
        Path(__file__).resolve().parent.parent.parent / ".env",
        Path.cwd() / ".env",
        Path.cwd() / "backend" / ".env",
    ]
    for env_path in possible_env_files:
        if env_path.is_file():
            try:
                for line in env_path.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("#") or not line:
                        continue
                    if line.startswith("GEMINI_API_KEY=") or line.startswith("GOOGLE_API_KEY="):
                        _, val = line.split("=", 1)
                        clean_val = val.strip().strip("'\"")
                        if clean_val:
                            return clean_val
            except Exception as e:
                logger.debug("Could not read %s: %s", env_path, e)

    # 3. Check pydantic settings
    try:
        from app.core.config import settings
        if settings.gemini_api_key and settings.gemini_api_key.strip():
            return settings.gemini_api_key.strip()
    except Exception:
        pass

    # 4. Check Modal persistent volume mount or local config
    for fallback_path in [
        Path("/canopylens-data/gemini_key.txt"),
        Path.home() / ".canopylens" / "gemini_key.txt",
    ]:
        try:
            if fallback_path.is_file():
                text = fallback_path.read_text(encoding="utf-8").strip()
                if text:
                    return text
        except Exception:
            pass

    return None


def _prepare_image_b64(image_path: str | Path, max_dim: int = 1280) -> Optional[tuple[str, str]]:
    """Load image, downscale if too large, and encode to base64 JPEG.

    Returns:
        (base64_string, mime_type) or None if unable to load.
    """
    try:
        import cv2
        import numpy as np

        path_str = str(image_path)
        img = None

        # 1. Try rasterio for GeoTIFF / multiband aerial imagery
        try:
            import rasterio

            with rasterio.open(path_str) as ds:
                if ds.count >= 3:
                    arr = ds.read([1, 2, 3])
                    rgb = np.moveaxis(arr, 0, -1)
                elif ds.count == 1:
                    arr = ds.read(1)
                    rgb = np.repeat(arr[:, :, np.newaxis], 3, axis=2)
                else:
                    arr = ds.read()
                    rgb = np.moveaxis(arr[:3], 0, -1)

                if rgb.dtype != np.uint8:
                    if rgb.max() <= 1.0:
                        rgb = rgb * 255.0
                    elif rgb.max() > 255.0:
                        rgb = rgb / rgb.max() * 255.0
                    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
                img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except Exception:
            pass

        # 2. Standard OpenCV read fallback
        if img is None:
            img = cv2.imread(path_str)

        # 3. PIL fallback
        if img is None:
            from PIL import Image

            with Image.open(path_str) as pil_img:
                rgb = pil_img.convert("RGB")
                img = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)

        if img is None:
            return None

        h, w = img.shape[:2]
        if max(h, w) > max_dim:
            scale = max_dim / float(max(h, w))
            nw, nh = int(round(w * scale)), int(round(h * scale))
            img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)

        # Encode to JPEG in memory
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), 85]
        success, encoded = cv2.imencode(".jpg", img, encode_params)
        if not success:
            return None

        b64_data = base64.b64encode(encoded.tobytes()).decode("utf-8")
        return b64_data, "image/jpeg"
    except Exception as exc:
        logger.warning("Failed to prepare image for Gemini vision: %s", exc)
        return None


def estimate_tree_count_gemini(
    image_path: str | Path,
    api_key: Optional[str] = None,
    timeout_seconds: float = 35.0,
) -> Optional[dict[str, Any]]:
    """Analyze aerial image using Google Gemini Vision to accurately count trees.

    Args:
        image_path: Path to aerial image (.tif, .png, .jpg, etc.)
        api_key: Optional explicit Gemini API key (defaults to GEMINI_API_KEY env)
        timeout_seconds: HTTP request timeout ceiling

    Returns:
        Dict with keys: `tree_count` (int), `confidence` (float), `density` (str), `reasoning` (str)
        or `None` if key missing, request timed out, or unparseable.
    """
    key = api_key or _get_api_key()
    if not key:
        logger.debug("Gemini API key not configured; skipping Gemini vision tree count.")
        return None

    prep = _prepare_image_b64(image_path)
    if prep is None:
        return None
    b64_img, mime_type = prep

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": FORESTRY_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": b64_img,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json",
        },
    }

    # Try supported models in order
    for model_name in GEMINI_MODELS:
        url = GEMINI_ENDPOINT_TEMPLATE.format(model=model_name, key=key)
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.post(url, json=payload)

            if response.status_code == 200:
                data = response.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        raw_text = parts[0]["text"].strip()
                        # Parse structured JSON
                        parsed = json.loads(raw_text)
                        if "tree_count" in parsed:
                            tree_count = int(parsed["tree_count"])
                            confidence = float(parsed.get("confidence", 0.90))
                            density = str(parsed.get("density", "sparse"))
                            reasoning = str(parsed.get("reasoning", ""))
                            logger.info(
                                "Gemini Vision verified tree count: %d trees (density=%s, confidence=%.2f): %s",
                                tree_count,
                                density,
                                confidence,
                                reasoning,
                            )
                            return {
                                "tree_count": tree_count,
                                "confidence": confidence,
                                "density": density,
                                "reasoning": reasoning,
                                "model": model_name,
                            }
            elif response.status_code == 404:
                # Model name might not be available on this API tier; try next
                logger.debug("Model %s returned 404; trying alternative.", model_name)
                continue
            else:
                logger.warning(
                    "Gemini API returned status %d for %s: %s",
                    response.status_code,
                    model_name,
                    response.text[:200],
                )
        except Exception as err:
            logger.warning("Gemini Vision request error on %s: %s", model_name, err)

    return None
