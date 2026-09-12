"""
test_api_endpoints.py — FastAPI endpoint tests for CanopyLens
=============================================================

These tests exercise the HTTP contract of every endpoint in
``app/routers/analysis.py`` using FastAPI's ``TestClient`` (backed by httpx).

ML models (DeepForest, SAM2) are always mocked out so the tests run fast and
offline.  A canned ``PipelineResult`` is injected wherever ``run_pipeline``
would normally be called.

Run with::

    cd backend
    pytest tests/test_api_endpoints.py -v
"""

from __future__ import annotations

import io
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.models.pipeline_models import (
    AreaResult,
    CrownPolygon,
    Detection,
    ImageMeta,
    PipelineResult,
)

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

SAMPLE_IMAGE = Path(__file__).parent.parent / "sample_data" / "osbs_crop.tif"


def _make_detection(**kwargs) -> Detection:
    defaults = dict(
        xmin=10.0, ymin=10.0, xmax=50.0, ymax=50.0,
        score=0.9, on_tile_edge=False, in_full_coords=True,
    )
    defaults.update(kwargs)
    return Detection(**defaults)


def _make_crown(cid: int, xmin=10, ymin=10, xmax=50, ymax=50, bucket="high", conf=0.88) -> CrownPolygon:
    det = _make_detection(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax, score=conf)
    return CrownPolygon(
        id=cid,
        detection=det,
        geometry_wkt=f"POLYGON (({xmin} {ymin}, {xmax} {ymin}, {xmax} {ymax}, {xmin} {ymax}, {xmin} {ymin}))",
        area_px=float((xmax - xmin) * (ymax - ymin)),
        mask_quality=1.0,
        confidence=conf,
        confidence_bucket=bucket,
    )


def _mock_result_pixel() -> PipelineResult:
    """Minimal PipelineResult for a non-georeferenced image."""
    crowns = [
        _make_crown(0, xmin=10, ymin=10, xmax=50, ymax=50, bucket="high", conf=0.88),
        _make_crown(1, xmin=60, ymin=60, xmax=100, ymax=100, bucket="medium", conf=0.55),
    ]
    return PipelineResult(
        image=ImageMeta(
            path="test.tif",
            width=512,
            height=512,
            band_count=3,
            georeferenced=False,
        ),
        total_trees=2,
        detections=[c.detection for c in crowns],
        crowns=crowns,
        area=AreaResult(
            area_units="pixels",
            count=2,
            sum_area=3200.0,
            union_area=3200.0,
        ),
        confidence_distribution={"high": 1, "medium": 1, "low": 0},
        warnings=["Image is not georeferenced."],
    )


@pytest.fixture()
def client():
    """Return a TestClient with ML model loading disabled."""
    with (
        patch("app.services.pipeline.get_deepforest_model"),
        patch("app.services.pipeline.get_sam2"),
    ):
        from app.main import app
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c


@pytest.fixture()
def done_job_id(client):
    """Submit a job and return its ID once it has reached 'done' status."""
    mock_result = _mock_result_pixel()
    with (
        patch("app.routers.analysis.run_pipeline", return_value=mock_result),
        patch("app.routers.analysis.load_and_validate_image"),
    ):
        with open(SAMPLE_IMAGE, "rb") as fh:
            r = client.post(
                "/analyze",
                files={"image": ("osbs_crop.tif", fh, "image/tiff")},
            )
    assert r.status_code == 202
    return r.json()["job_id"]


# ---------------------------------------------------------------------------
# Health / root
# ---------------------------------------------------------------------------


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_root_ok(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "docs" in r.json()


# ---------------------------------------------------------------------------
# POST /analyze — validation
# ---------------------------------------------------------------------------


def test_analyze_rejects_unsupported_image_extension(client):
    """Unsupported image extension returns 415 with a clear message."""
    r = client.post(
        "/analyze",
        files={"image": ("photo.bmp", b"fake", "image/bmp")},
    )
    assert r.status_code == 415
    detail = r.json()["detail"]
    assert ".bmp" in detail
    assert "Accepted formats" in detail


def test_analyze_rejects_no_extension(client):
    r = client.post(
        "/analyze",
        files={"image": ("noext", b"fake", "image/tiff")},
    )
    assert r.status_code == 415
    assert "no extension" in r.json()["detail"].lower() or "unsupported" in r.json()["detail"].lower()


def test_analyze_rejects_bad_kml_extension(client):
    """A KML supplied with the wrong extension returns 415."""
    with open(SAMPLE_IMAGE, "rb") as fh:
        r = client.post(
            "/analyze",
            files={
                "image": ("test.tif", fh, "image/tiff"),
                "kml": ("boundary.txt", b"not kml", "text/plain"),
            },
        )
    assert r.status_code == 415
    assert ".kml" in r.json()["detail"]


def test_analyze_rejects_corrupt_image(client):
    """An image file with invalid content returns 422."""
    r = client.post(
        "/analyze",
        files={"image": ("bad.tif", b"this is not a real tiff", "image/tiff")},
    )
    assert r.status_code == 422
    assert "could not be opened" in r.json()["detail"].lower()


def test_analyze_rejects_invalid_kml(client):
    """A KML file that fails to parse returns 422."""
    with (
        patch("app.routers.analysis.load_and_validate_image"),
    ):
        with open(SAMPLE_IMAGE, "rb") as fh:
            r = client.post(
                "/analyze",
                files={
                    "image": ("test.tif", fh, "image/tiff"),
                    "kml": ("boundary.kml", b"<kml><garbage/></kml>", "application/vnd.google-earth.kml+xml"),
                },
            )
    # Either 422 (parse error) or 422 (no polygon) — must not be 200/202
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /analyze — happy path
# ---------------------------------------------------------------------------


def test_analyze_returns_job_id_status_created_at(client):
    """POST /analyze must return job_id, status, and created_at."""
    mock_result = _mock_result_pixel()
    with (
        patch("app.routers.analysis.run_pipeline", return_value=mock_result),
        patch("app.routers.analysis.load_and_validate_image"),
    ):
        with open(SAMPLE_IMAGE, "rb") as fh:
            r = client.post(
                "/analyze",
                files={"image": ("osbs_crop.tif", fh, "image/tiff")},
            )
    assert r.status_code == 202
    body = r.json()
    assert "job_id" in body, "job_id missing from response"
    assert body["status"] == "queued"
    assert "created_at" in body
    # created_at must be an ISO-8601 string
    from datetime import datetime
    datetime.fromisoformat(body["created_at"])  # raises if not valid


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}
# ---------------------------------------------------------------------------


def test_job_status_done(client, done_job_id):
    r = client.get(f"/jobs/{done_job_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "done"
    assert body["error"] is None


def test_job_status_404_unknown(client):
    r = client.get("/jobs/definitely-does-not-exist")
    assert r.status_code == 404
    detail = r.json()["detail"].lower()
    assert "no job" in detail or "not found" in detail


def test_job_status_failed_exposes_error_message(client):
    """When a job fails, GET /jobs/{id} must expose the real error."""
    with (
        patch("app.routers.analysis.run_pipeline", side_effect=RuntimeError("GPU OOM: out of memory")),
        patch("app.routers.analysis.load_and_validate_image"),
    ):
        with open(SAMPLE_IMAGE, "rb") as fh:
            r = client.post("/analyze", files={"image": ("test.tif", fh, "image/tiff")})
    job_id = r.json()["job_id"]
    r2 = client.get(f"/jobs/{job_id}")
    assert r2.json()["status"] == "failed"
    assert "GPU OOM" in r2.json()["error"]


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/result
# ---------------------------------------------------------------------------


def test_result_geojson_structure(client, done_job_id):
    """Result must be a GeoJSON FeatureCollection with the required fields."""
    r = client.get(f"/jobs/{done_job_id}/result")
    assert r.status_code == 200
    body = r.json()

    # Top-level structure
    assert body["type"] == "FeatureCollection"
    assert isinstance(body["features"], list)
    assert "summary" in body

    # Each feature
    for feat in body["features"]:
        assert feat["type"] == "Feature"
        props = feat["properties"]
        for field in ("tree_id", "area_px", "confidence", "confidence_bucket", "on_tile_edge"):
            assert field in props, f"Missing property: {field}"


def test_result_summary_fields(client, done_job_id):
    """Summary must have all required top-level fields."""
    r = client.get(f"/jobs/{done_job_id}/result")
    summary = r.json()["summary"]
    for field in (
        "tree_count", "canopy_cover_percent", "confidence_breakdown",
        "georeferenced", "warnings",
    ):
        assert field in summary, f"Missing summary field: {field}"
    assert isinstance(summary["confidence_breakdown"], dict)
    for bucket in ("high", "medium", "low"):
        assert bucket in summary["confidence_breakdown"]


def test_result_409_when_queued(client):
    """GET result on a queued job must return 409 with a clear message."""
    from app.core.job_store import job_store
    j = job_store.create("fake.tif", None)
    r = client.get(f"/jobs/{j.id}/result")
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "queued" in detail.lower() or "not available" in detail.lower()


def test_result_409_when_failed_shows_error(client):
    """GET result on a failed job must show the error in the 409 detail."""
    with (
        patch("app.routers.analysis.run_pipeline", side_effect=ValueError("bad raster transform")),
        patch("app.routers.analysis.load_and_validate_image"),
    ):
        with open(SAMPLE_IMAGE, "rb") as fh:
            r = client.post("/analyze", files={"image": ("test.tif", fh, "image/tiff")})
    job_id = r.json()["job_id"]
    r2 = client.get(f"/jobs/{job_id}/result")
    assert r2.status_code == 409
    assert "bad raster transform" in r2.json()["detail"]


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/export/geojson
# ---------------------------------------------------------------------------


def test_export_geojson_content_disposition(client, done_job_id):
    r = client.get(f"/jobs/{done_job_id}/export/geojson")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/geo+json")
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd
    assert ".geojson" in cd


def test_export_geojson_body_is_valid_json(client, done_job_id):
    import json
    r = client.get(f"/jobs/{done_job_id}/export/geojson")
    body = json.loads(r.text)
    assert body["type"] == "FeatureCollection"


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/export/csv
# ---------------------------------------------------------------------------


def test_export_csv_content_disposition(client, done_job_id):
    r = client.get(f"/jobs/{done_job_id}/export/csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd
    assert ".csv" in cd


def test_export_csv_has_correct_header_row(client, done_job_id):
    r = client.get(f"/jobs/{done_job_id}/export/csv")
    first_line = r.text.splitlines()[0]
    for col in ("tree_id", "area_m2", "confidence", "confidence_bucket", "on_tile_edge"):
        assert col in first_line, f"Column '{col}' missing from CSV header"


def test_export_csv_row_count_matches_tree_count(client, done_job_id):
    r_result = client.get(f"/jobs/{done_job_id}/result")
    expected = len(r_result.json()["features"])

    r_csv = client.get(f"/jobs/{done_job_id}/export/csv")
    # lines = header + one row per tree
    data_rows = [l for l in r_csv.text.splitlines() if l.strip()][1:]
    assert len(data_rows) == expected
