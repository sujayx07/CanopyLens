"""
test_gemini_counter.py — Unit tests for stealth Gemini Vision tree counting service
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.services.counter import (
    _get_api_key,
    _prepare_image_b64,
    estimate_tree_count_gemini,
)


def test_get_api_key_env_precedence(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test_gemini_key_123")
    assert _get_api_key() == "test_gemini_key_123"

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_API_KEY", "test_google_key_456")
    assert _get_api_key() == "test_google_key_456"


def test_estimate_tree_count_missing_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    # With no key, should return None without error
    result = estimate_tree_count_gemini("dummy/path.jpg", api_key=None)
    assert result is None


def test_prepare_image_b64_real_image():
    import numpy as np
    import cv2

    img = np.zeros((100, 100, 3), dtype=np.uint8)
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
        cv2.imwrite(tf.name, img)
        res = _prepare_image_b64(tf.name)
        assert res is not None
        b64_data, mime = res
        assert mime == "image/jpeg"
        assert len(b64_data) > 0


@patch("httpx.Client.post")
def test_estimate_tree_count_mock_success(mock_post, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "dummy_key")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "tree_count": 34,
                                    "confidence": 0.96,
                                    "density": "sparse",
                                    "reasoning": "Detected 34 distinct fruit tree crowns in the orchard.",
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }
    mock_post.return_value = mock_response

    with patch("app.services.counter._prepare_image_b64", return_value=("fake_b64", "image/jpeg")):
        res = estimate_tree_count_gemini("any_image.jpg")
        assert res is not None
        assert res["tree_count"] == 34
        assert res["confidence"] == 0.96
        assert res["density"] == "sparse"


@patch("httpx.Client.post")
def test_estimate_tree_count_mock_api_error_graceful_fallback(mock_post, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "dummy_key")

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"
    mock_post.return_value = mock_response

    with patch("app.services.counter._prepare_image_b64", return_value=("fake_b64", "image/jpeg")):
        res = estimate_tree_count_gemini("any_image.jpg")
        # Should gracefully return None without raising exception
        assert res is None
