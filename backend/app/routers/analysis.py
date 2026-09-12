"""
analysis.py — CanopyLens API endpoints
=======================================

POST /analyze
GET  /jobs/{job_id}
GET  /jobs/{job_id}/result
GET  /jobs/{job_id}/export/geojson
GET  /jobs/{job_id}/export/csv

Uses FastAPI BackgroundTasks + an in-memory (dict-based) JobStore.
No Celery, no Redis — simple enough for a solo weekend deployment.
"""

import json
import logging
import shutil
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.core.job_store import job_store
from app.models.jobs import JobStatusResponse
from app.services import results as result_serializer
from app.services.pipeline import (
    load_and_validate_image,
    load_transform,
    parse_kml_to_wgs84,
    run_pipeline,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["analysis"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
import os as _os

# On Modal the Volume is mounted at /canopylens-data; CANOPYLENS_UPLOAD_ROOT
# is set to /canopylens-data/uploads so uploads survive container restarts.
# Locally it falls back to backend/uploads/ (the repository default).
UPLOAD_ROOT = Path(
    _os.environ.get(
        "CANOPYLENS_UPLOAD_ROOT",
        str(Path(__file__).resolve().parents[2] / "uploads"),
    )
)
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES: int = 200 * 1024 * 1024  # 200 MB
MAX_UPLOAD_MB: int = MAX_UPLOAD_BYTES // (1024 * 1024)

IMAGE_EXTENSIONS = {".tif", ".tiff", ".png", ".jpg", ".jpeg"}
KML_EXTENSIONS = {".kml"}
READ_CHUNK = 1024 * 1024  # 1 MB streaming read


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_job(job_id: str):
    """Fetch a job record or raise 404."""
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job found with id '{job_id}'.")
    return job


def _require_done(job_id: str):
    """Fetch a job that must be in 'done' state or raise 409."""
    job = _require_job(job_id)
    if job.status != "done":
        if job.status == "failed" and job.error:
            detail = (
                f"Job failed and results cannot be retrieved. "
                f"Error: {job.error}"
            )
        else:
            detail = (
                f"Results are not available yet — job status is '{job.status}'. "
                "Poll GET /jobs/{job_id} until status is 'done'."
            )
        raise HTTPException(status_code=409, detail=detail)
    return job


async def _save_upload(destination: Path, upload: UploadFile) -> int:
    """Stream-save an upload to *destination*, enforcing the size limit.

    Returns the number of bytes written. Raises HTTP 413 if the limit is
    exceeded — the caller is responsible for cleaning up the job directory.
    """
    size = 0
    with open(destination, "wb") as handle:
        while True:
            chunk = await upload.read(READ_CHUNK)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"File exceeds the {MAX_UPLOAD_MB} MB upload limit "
                        f"({size // (1024 * 1024)} MB received so far). "
                        "Please reduce the file size and try again."
                    ),
                )
            handle.write(chunk)
    return size


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------


def _process_job(job_id: str) -> None:
    """Run the ML pipeline for *job_id* in a background thread.

    FastAPI's BackgroundTasks executes this in a thread-pool worker so it does
    not block the async event loop. All state transitions and structured log
    events are written here so the frontend can always poll a real status.
    """
    job = job_store.get(job_id)
    if job is None:
        logger.error("background worker: job %s not found in store", job_id)
        return

    job_store.update(job_id, status="processing")
    started = time.perf_counter()

    logger.info(
        "job_start job_id=%s image=%s kml=%s",
        job_id,
        job.image_path,
        job.kml_path or "none",
    )

    try:
        result = run_pipeline(job.image_path, kml_path=job.kml_path)

        # Persist the rasterio affine transform as a plain dict so it can be
        # used later by the results serialiser without reimporting rasterio.
        transform = None
        kml_crs_wkt = None
        if result.image.georeferenced:
            affine = load_transform(job.image_path)
            transform = {
                "a": float(affine.a),
                "b": float(affine.b),
                "c": float(affine.c),
                "d": float(affine.d),
                "e": float(affine.e),
                "f": float(affine.f),
            }
            kml_crs_wkt = result.kml_boundary_wkt

        # Back-fill per-crown m² areas from the area result.
        if result.area.area_units == "m2":
            for crown, per in zip(result.crowns, result.area.per_crown):
                crown.area_m2 = per["area"]

        job_store.complete(
            job_id, result=result, transform=transform, kml_crs_wkt=kml_crs_wkt
        )

        elapsed = time.perf_counter() - started
        logger.info(
            "job_done job_id=%s tree_count=%d detection_count=%d "
            "sum_area_m2=%.2f union_area_m2=%.2f georeferenced=%s "
            "processing_duration_s=%.1f",
            job_id,
            result.total_trees,
            len(result.detections),
            result.area.sum_area if result.area.area_units == "m2" else 0.0,
            result.area.union_area if result.area.area_units == "m2" else 0.0,
            result.image.georeferenced,
            elapsed,
        )

    except Exception as exc:  # noqa: BLE001
        elapsed = time.perf_counter() - started
        error_msg = str(exc)
        job_store.update(job_id, status="failed", error=error_msg)
        logger.exception(
            "job_failed job_id=%s processing_duration_s=%.1f error=%r",
            job_id,
            elapsed,
            error_msg,
        )


# ---------------------------------------------------------------------------
# POST /analyze
# ---------------------------------------------------------------------------


@router.post(
    "/analyze",
    status_code=202,
    summary="Submit an image for tree-crown analysis",
)
async def analyze(
    background: BackgroundTasks,
    image: UploadFile = File(
        ...,
        description="Aerial/satellite image (.tif/.tiff/.png/.jpg/.jpeg, max 200 MB)",
    ),
    kml: Optional[UploadFile] = File(
        None,
        description=(
            "Optional KML boundary file (.kml). "
            "Only detections within the polygon boundary are kept."
        ),
    ),
):
    """Accept an image upload, validate it, and enqueue a pipeline job.

    All validation errors are returned as 4xx responses with a human-readable
    ``detail`` message — there are no silent failures.

    Returns ``{job_id, status, created_at}`` immediately (HTTP 202).
    Poll ``GET /jobs/{job_id}`` for status updates.
    """
    # --- 1. Validate file extensions (fast, before any disk I/O) -----------
    image_name = image.filename or ""
    image_ext = Path(image_name).suffix.lower()
    if image_ext not in IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported image format '{image_ext or '(no extension)'}'. "
                f"Accepted formats: {sorted(IMAGE_EXTENSIONS)}. "
                "Rename your file to the correct extension and retry."
            ),
        )

    if kml is not None:
        kml_ext = Path(kml.filename or "").suffix.lower()
        if kml_ext not in KML_EXTENSIONS:
            raise HTTPException(
                status_code=415,
                detail=(
                    f"KML file must use a .kml extension (received '{kml_ext}'). "
                    "Export your boundary as a KML file and retry."
                ),
            )

    # --- 2. Early Content-Length check (skip streaming a known-too-large file)
    declared = image.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Image Content-Length ({int(declared) // (1024 * 1024)} MB) "
                f"exceeds the {MAX_UPLOAD_MB} MB limit."
            ),
        )

    # --- 3. Create job directory and stream-save the uploaded files ---------
    job_dir = UPLOAD_ROOT / uuid.uuid4().hex
    job_dir.mkdir(parents=True, exist_ok=True)
    image_path = job_dir / f"image{image_ext}"
    kml_path: Optional[Path] = None

    try:
        img_bytes = await _save_upload(image_path, image)
        logger.debug("upload saved image=%s bytes=%d", image_path, img_bytes)

        if kml is not None:
            kml_path = job_dir / "boundary.kml"
            kml_bytes = await _save_upload(kml_path, kml)
            logger.debug("upload saved kml=%s bytes=%d", kml_path, kml_bytes)

    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to save uploaded file: {exc}",
        ) from exc

    # --- 4. Validate image readability before queuing -----------------------
    try:
        load_and_validate_image(str(image_path))
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(
            status_code=422,
            detail=(
                f"Uploaded image could not be opened: {exc}. "
                "Ensure the file is a valid GeoTIFF, PNG, or JPEG."
            ),
        ) from exc

    # --- 5. Validate KML (parse-check before queuing) -----------------------
    if kml_path is not None:
        try:
            kml_polygon = parse_kml_to_wgs84(str(kml_path))
        except Exception as exc:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise HTTPException(
                status_code=422,
                detail=f"KML file could not be parsed: {exc}.",
            ) from exc

        if kml_polygon is None:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise HTTPException(
                status_code=422,
                detail=(
                    "KML file does not contain any polygon geometries. "
                    "Ensure the KML has at least one <Polygon> element."
                ),
            )

    # --- 6. Create the job record and schedule the background task ----------
    job = job_store.create(
        str(image_path),
        str(kml_path) if kml_path is not None else None,
    )
    background.add_task(_process_job, job.id)

    logger.info(
        "job_queued job_id=%s image=%s kml=%s",
        job.id,
        image_name,
        kml.filename if kml else "none",
    )

    return {
        "job_id": job.id,
        "status": job.status,
        "created_at": job.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}
# ---------------------------------------------------------------------------


@router.get(
    "/jobs/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll job status",
)
async def job_status(job_id: str):
    """Return the current processing status of a job.

    Possible ``status`` values: ``queued``, ``processing``, ``done``, ``failed``.

    When ``status`` is ``failed`` the ``error`` field contains the actual
    exception message so the frontend can display a meaningful error instead
    of a spinner that hangs forever.
    """
    job = _require_job(job_id)
    return JobStatusResponse(status=job.status, error=job.error)


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/result
# ---------------------------------------------------------------------------


@router.get(
    "/jobs/{job_id}/result",
    summary="Fetch full analysis result as GeoJSON FeatureCollection",
)
async def job_result(job_id: str):
    """Return the complete pipeline result as a GeoJSON FeatureCollection.

    Each Feature represents one detected tree crown. Top-level ``summary``
    includes tree_count, sum_area_m2, union_area_m2, canopy_cover_percent,
    confidence_breakdown, georeferenced flag, and any pipeline warnings.

    Returns **409** if the job is not yet in the ``done`` state.
    """
    job = _require_done(job_id)
    return result_serializer.build_result_payload(job)


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/export/geojson
# ---------------------------------------------------------------------------


@router.get(
    "/jobs/{job_id}/export/geojson",
    summary="Download result as a GeoJSON file",
)
async def export_geojson(job_id: str):
    """Stream the full result as a downloadable ``application/geo+json`` file.

    Identical body to ``GET /jobs/{job_id}/result`` but with
    ``Content-Disposition: attachment`` so browsers trigger a file-save dialog.
    """
    job = _require_done(job_id)
    payload = result_serializer.build_result_payload(job)
    content = json.dumps(payload, indent=2)
    return Response(
        content=content,
        media_type="application/geo+json",
        headers={
            "Content-Disposition": f'attachment; filename="canopylens_{job_id}.geojson"',
            "Content-Length": str(len(content.encode())),
        },
    )


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/export/csv
# ---------------------------------------------------------------------------


@router.get(
    "/jobs/{job_id}/export/csv",
    summary="Download per-tree results as a CSV file",
)
async def export_csv(job_id: str):
    """Stream per-tree results as a downloadable ``text/csv`` file.

    Columns: tree_id, area_m2, area_px, confidence, confidence_bucket,
    on_tile_edge, mask_quality, bbox_xmin, bbox_ymin, bbox_xmax, bbox_ymax.
    """
    job = _require_done(job_id)
    content = result_serializer.build_csv(job)
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="canopylens_{job_id}.csv"',
            "Content-Length": str(len(content.encode())),
        },
    )


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/image
# ---------------------------------------------------------------------------


@router.get(
    "/jobs/{job_id}/image",
    summary="Get RGB preview of the uploaded image for map/raster overlay",
)
async def job_image(job_id: str):
    """Serve a PNG/JPEG view of the job image for raster overlays."""
    from io import BytesIO
    from PIL import Image
    import numpy as np

    job = _require_done(job_id)
    image_path = Path(job.image_path)
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Uploaded image not found")

    try:
        if image_path.suffix.lower() in {".tif", ".tiff"}:
            import rasterio

            with rasterio.open(image_path) as src:
                # Read 3 bands or single band
                count = src.count
                if count >= 3:
                    arr = src.read([1, 2, 3])
                    # Move channel to last axis: (C, H, W) -> (H, W, C)
                    arr = np.transpose(arr, (1, 2, 0))
                else:
                    arr = src.read(1)
                    arr = np.stack([arr] * 3, axis=-1)

                # Normalize to uint8 if needed
                if arr.dtype != np.uint8:
                    if np.issubdtype(arr.dtype, np.floating) and arr.max() <= 1.0:
                        arr = (arr * 255.0).astype(np.uint8)
                    else:
                        arr_min = float(arr.min())
                        arr_max = float(arr.max())
                        if arr_max > arr_min:
                            arr = ((arr - arr_min) / (arr_max - arr_min) * 255.0).astype(np.uint8)
                        else:
                            arr = np.zeros_like(arr, dtype=np.uint8)
                img = Image.fromarray(arr)
        else:
            img = Image.open(image_path).convert("RGB")

        # Downsample if exceedingly large to optimize browser performance
        max_dim = 2048
        if max(img.width, img.height) > max_dim:
            scale = max_dim / float(max(img.width, img.height))
            new_size = (int(img.width * scale), int(img.height * scale))
            img = img.resize(new_size, Image.Resampling.BILINEAR)

        buf = BytesIO()
        img.save(buf, format="JPEG", quality=85)
        buf.seek(0)
        return Response(content=buf.getvalue(), media_type="image/jpeg")
    except Exception as e:
        logger.error("failed to generate image preview for job %s: %s", job_id, e)
        raise HTTPException(status_code=500, detail=f"Could not render image preview: {e}")