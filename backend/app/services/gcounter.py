"""
gemini_counter.py — Compatibility wrapper for app.services.counter
"""

from app.services.counter import (
    FORESTRY_PROMPT,
    GEMINI_ENDPOINT_TEMPLATE,
    GEMINI_MODELS,
    _get_api_key,
    _prepare_image_b64,
    estimate_tree_count_gemini,
)

__all__ = [
    "FORESTRY_PROMPT",
    "GEMINI_ENDPOINT_TEMPLATE",
    "GEMINI_MODELS",
    "_get_api_key",
    "_prepare_image_b64",
    "estimate_tree_count_gemini",
]
