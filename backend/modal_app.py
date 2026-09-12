"""
modal_app.py — CanopyLens Modal deployment
==========================================

Deploys the CanopyLens FastAPI backend to Modal with GPU-backed inference.

Design decisions
----------------

**GPU: T4 (16 GB VRAM)**
    SAM2-hiera-small (~160 MB weights) and DeepForest together fit comfortably
    inside a T4.  An A10G is ~3× more expensive per second; L4 is middle ground.
    For a solo weekend demo the T4 gives the best cost/capability ratio.

**Model weights at image-build time**
    `_download_models()` is called inside `modal.Image.run_function()` so the
    HuggingFace and DeepForest weights are baked into the container image layer.
    Cold starts skip the 1-2 GB download entirely.

**Persistence / job-store strategy: Modal Volume**
    Modal container filesystems are ephemeral — a new cold-start loses any
    in-memory job state.  We solve this two ways:

    1. A `modal.Volume` mounted at `/canopylens-data` persists:
       - uploaded image files  (survives container restarts)
       - HuggingFace model cache (belt-and-suspenders alongside image baking)

    2. The in-memory `JobStore` (dict + threading.Lock) still lives in the
       FastAPI process.  Because this is a DEMO (one warm container at a time,
       one job at a time), a job is queued, processed, and polled all within
       the same warm container lifetime.  We keep `max_containers=1` to enforce
       this guarantee: there is only ever one container holding the job state.

    If you outgrow the single-container model, replace the in-memory JobStore
    with a SQLite file on the Volume — that gives full cross-restart persistence
    without adding any external dependencies.

**Timeout: 600 s (10 minutes)**
    DeepForest + SAM2 on a tiled 200 MB GeoTIFF can take 3-5 minutes.  10 min
    is generous enough for worst-case inputs while staying within Modal's HTTP
    request timeout limits.

Usage
-----
::

    # One-time setup
    pip install modal
    modal setup          # authenticates with your Modal account

    # Deploy
    cd backend
    modal deploy modal_app.py

    # Outputs something like:
    # ✔ Created web endpoint at https://<your-workspace>--canopylens-api.modal.run

    # Development (live-reload, no permanent deployment)
    modal serve modal_app.py
"""

from __future__ import annotations

import modal

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = modal.App("canopylens")

# ---------------------------------------------------------------------------
# Persistent Volume
# · /canopylens-data/uploads  — uploaded images/KML files
# · /canopylens-data/hf-cache — HuggingFace model cache (belt-and-suspenders)
# ---------------------------------------------------------------------------

volume = modal.Volume.from_name("canopylens-data", create_if_missing=True)
VOLUME_MOUNT = "/canopylens-data"
UPLOADS_DIR = f"{VOLUME_MOUNT}/uploads"
HF_CACHE_DIR = f"{VOLUME_MOUNT}/hf-cache"

# ---------------------------------------------------------------------------
# Container image
# · Base: official PyTorch CUDA image (avoids building CUDA from scratch)
# · System deps: GDAL/GEOS for rasterio, libGL for OpenCV
# · Python deps: all from requirements.txt
# · Model weights: baked in via run_function() — not downloaded at runtime
# ---------------------------------------------------------------------------

_CUDA_VERSION = "12.1.0"
_CUDNN_VERSION = "8"
_BASE_IMAGE = f"nvidia/cuda:{_CUDA_VERSION}-cudnn{_CUDNN_VERSION}-devel-ubuntu22.04"

image = (
    modal.Image.from_registry(_BASE_IMAGE, add_python="3.11")
    # System libraries required by rasterio, shapely, and OpenCV
    .apt_install(
        "gdal-bin",
        "libgdal-dev",
        "libgeos-dev",
        "libgl1",          # OpenCV
        "libglib2.0-0",    # OpenCV / GLib
        "libproj-dev",
        "proj-bin",
        "git",             # deepforest pulls some assets via git
    )
    # Install torch with CUDA 12.1 wheels explicitly before other packages so
    # pip doesn't resolve to a CPU-only wheel from PyPI.
    .pip_install(
        "torch==2.3.0+cu121",
        "torchvision==0.18.0+cu121",
        find_links="https://download.pytorch.org/whl/torch_stable.html",
    )
    # Remaining Python dependencies (everything else from requirements.txt)
    .pip_install(
        "fastapi",
        "uvicorn[standard]",
        "python-multipart",
        "pydantic-settings",
        "rasterio",
        "shapely",
        "geopandas",
        "pyproj",
        "deepforest",
        "transformers>=4.40.0",
        "safetensors",
        "accelerate",          # needed by some transformers model loading paths
        "opencv-python-headless",  # headless avoids X11 deps on server
        "numpy",
        "httpx",
    )
    # HuggingFace cache environment — point to the Volume so the baked weights
    # survive even if the image layer gets evicted.
    .env({
        "HF_HOME": HF_CACHE_DIR,
        "TRANSFORMERS_CACHE": HF_CACHE_DIR,
        "DEEPFOREST_CACHE_DIR": f"{VOLUME_MOUNT}/deepforest-cache",
        # Tell the app where to store uploads inside the Volume
        "CANOPYLENS_UPLOAD_ROOT": UPLOADS_DIR,
        # CORS: will be overridden by environment variable at deploy time
        "CORS_ORIGINS": "https://your-frontend.vercel.app,http://localhost:5173",
    })
)


# ---------------------------------------------------------------------------
# Model pre-download function
# Runs ONCE at image build time via .run_function().
# Bakes DeepForest weights and SAM2 weights into the image layer.
# ---------------------------------------------------------------------------

def _download_models():
    """Pre-download all ML model weights into the image layer.

    Called by modal.Image.run_function() during `modal deploy` so that cold
    starts never need to hit HuggingFace or the DeepForest CDN.
    """
    import os
    print("[build] Downloading DeepForest model...")
    from deepforest import main as df_main  # noqa: PLC0415
    model = df_main.deepforest()
    model.load_model()
    print("[build] DeepForest model downloaded.")

    print("[build] Downloading SAM2 model (facebook/sam2-hiera-small)...")
    from transformers import Sam2Model, Sam2Processor  # noqa: PLC0415
    Sam2Processor.from_pretrained("facebook/sam2-hiera-small")
    Sam2Model.from_pretrained("facebook/sam2-hiera-small")
    print("[build] SAM2 model downloaded.")


# Attach the model download to the image build pipeline.
# The Volume is mounted so the weights also land in the persistent cache
# directory as a fallback — the primary copy lives in the image layer.
image = image.run_function(
    _download_models,
    volumes={VOLUME_MOUNT: volume},
    gpu="T4",                    # download on GPU instance so torch-cuda is happy
    timeout=1200,                # 20 min ceiling for initial weight download
)

# ---------------------------------------------------------------------------
# Mount the local app code into the container
# ---------------------------------------------------------------------------

# All Python source under backend/app/ plus the .env.example (for defaults)
image = image.add_local_dir(
    ".",
    remote_path="/app",
    ignore=[
        ".pytest_cache",
        "__pycache__",
        ".git",
        "sample_data",
        "uploads",
        ".env",
        ".env.*",
        "node_modules",
        "*.pyc",
    ],
)

# ---------------------------------------------------------------------------
# FastAPI ASGI endpoint
# ---------------------------------------------------------------------------

@app.function(
    image=image,
    gpu="T4",
    # ---------------------
    # Timeout
    # Large GeoTIFF tiling (1024 px tiles) + SAM2 segmentation can take 3-5
    # minutes for a 200 MB file.  10 minutes gives a comfortable safety margin.
    # ---------------------
    timeout=600,
    # ---------------------
    # Concurrency
    # max_containers=1 guarantees a single warm container holds all in-memory
    # job state.  Scale this up only after replacing the in-memory JobStore
    # with a Volume-backed SQLite store (see Design decisions above).
    # ---------------------
    max_containers=1,
    # ---------------------
    # Volume mount
    # /canopylens-data/uploads — persists uploaded files across cold starts
    # /canopylens-data/hf-cache — persists HF cache as belt-and-suspenders
    # ---------------------
    volumes={VOLUME_MOUNT: volume},
    # Keep the mount path in sync with CANOPYLENS_UPLOAD_ROOT env var
    # Secrets: add modal.Secret.from_name("canopylens-secrets") here if you
    # store CORS_ORIGINS or HF_TOKEN in a Modal Secret.
)
@modal.asgi_app()
def fastapi_app():
    """Return the CanopyLens FastAPI ASGI application.

    Modal calls this function once per container startup to obtain the ASGI
    callable.  The function is intentionally thin — all real initialisation
    (model loading, CORS, routing) lives in app/main.py.
    """
    import sys
    import os

    # The local source was mounted at /app; add it to sys.path.
    sys.path.insert(0, "/app")

    # Point the upload root at the persistent Volume directory so files
    # survive container restarts.
    os.environ.setdefault("CANOPYLENS_UPLOAD_ROOT", UPLOADS_DIR)

    # Ensure the uploads directory exists (Volume is mounted read-write).
    os.makedirs(UPLOADS_DIR, exist_ok=True)

    from app.main import app as fastapi_application  # noqa: PLC0415
    return fastapi_application


# ---------------------------------------------------------------------------
# Local entrypoint for quick smoke-tests
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main():
    """Sanity-check the deployed endpoint by hitting /health."""
    import urllib.request
    url = "https://your-workspace--canopylens-fastapi-app.modal.run/health"
    print(f"Hitting {url} ...")
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            print("Status:", resp.status)
            print("Body:", resp.read().decode())
    except Exception as exc:
        print(f"Error: {exc}")
        print("Replace 'your-workspace' with your actual Modal workspace name.")
