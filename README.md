<img src="/CanopyLens.png" alt="Alt Text" />

# CanopyLens — AI Aerial Tree Crown & Canopy Intelligence

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%20%7C%203.12%20%7C%203.13-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0+-646CFF.svg)](https://vitejs.dev/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-EE4C2C.svg)](https://pytorch.org/)
[![Tests](https://img.shields.io/badge/Tests-39%20Passed-brightgreen.svg)]()

**High-precision instance segmentation translating multi-spectral GeoTIFF orthomosaics into vectorized tree crown polygons, automated non-overlapping canopy cover percentages, and ecological telemetry.**

[Explore Live Demo](https://canopy-lens.vercel.app) • [Modal API Swagger Docs](https://iphoneindiatoday--canopylens-fastapi-app.modal.run/docs) • [Technical Documentation](DOCUMENTATION.md) • [GitHub Repository](https://github.com/sujayx07/CanopyLens)

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Key Capabilities](#key-capabilities)
3. [Architecture & Pipeline Flow](#architecture--pipeline-flow)
4. [Repository Structure](#repository-structure)
5. [Prerequisites](#prerequisites)
6. [Local Quickstart & Setup Guide](#local-quickstart--setup-guide)
   - [Backend Setup (FastAPI + Python)](#1-backend-setup)
   - [Frontend Setup (React + Vite)](#2-frontend-setup)
7. [Cloud Production Deployments](#cloud-production-deployments)
   - [Modal GPU Deployment (Backend)](#modal-gpu-deployment)
   - [Vercel Deployment (Frontend)](#vercel-deployment)
8. [Pipeline Technical Deep-Dive](#pipeline-technical-deep-dive)
   - [Windowed Tiling & Stride](#1-windowed-tiling--stride)
   - [DeepForest Tree Crown Proposals](#2-deepforest-tree-crown-proposals)
   - [Instance Segmentation & Contouring](#3-instance-segmentation--contouring)
   - [Geometric Dissolve vs Sum of Crown Areas](#4-geometric-dissolve-vs-sum-of-crown-areas)
   - [Geodetic Reprojection (UTM Zones & WGS84)](#5-geodetic-reprojection)
9. [REST API Reference](#rest-api-reference)
10. [Evaluation & Fine-Tuning Harness](#evaluation--fine-tuning-harness)
11. [Testing & Quality Assurance](#testing--quality-assurance)
12. [Troubleshooting & FAQs](#troubleshooting--faqs)
13. [License & Acknowledgments](#license--acknowledgments)

---

## Overview

**CanopyLens** bridges the gap between raw high-resolution aerial photogrammetry (drone orthomosaics, airborne LiDAR-derived imagery, and multispectral satellite data) and actionable environmental science.

Traditional remote sensing approaches rely heavily on manual photo-interpretation or coarse pixel-level vegetation indices (such as NDVI thresholds) that fail to separate individual tree crowns or accurately handle overlapping forest canopies.

CanopyLens provides an automated, end-to-end deep learning and geospatial geometry pipeline that:
1. Detects individual tree crowns across multi-gigabyte orthomosaics without tile-edge cutoffs.
2. Segments organic, pixel-precise crown polygon envelopes.
3. Quantifies both **Raw Sum of Crown Areas** and **Non-Overlapping Canopy Union Cover** via geometric polygon union (`shapely.ops.unary_union`).
4. Re-projects local pixel coordinates to UTM zones for physically verified metric measurements ($\text{m}^2$, hectares, diameter).
5. Exports GIS-standard GeoJSON FeatureCollections, Shapefiles, and CSV telemetry tables.

---

## Key Capabilities

- **DeepForest 2.1 Object Detection**: RetinaNet with a ResNet50 backbone, pretrained on extensive National Ecological Observatory Network (NEON) airborne benchmark datasets.
- **Organic Crown Instance Segmentation**: Polygon extraction capturing asymmetric canopy shapes, natural gaps, and branch envelopes rather than crude bounding boxes.
- **Exact Geometric Canopy Dissolve**: Computes true non-overlapping canopy ground cover percentage, eliminating double-counting in dense forest clusters while isolating canopy overlap telemetry.
- **Universal Coordinate Engine**: Automatically extracts GeoTIFF affine transforms, infers optimal local UTM zones for distortion-free metric calculations, and projects coordinates to standard WGS84 (EPSG:4326).
- **Gigapixel Orthomosaic Tiling**: Sliding window with configurable overlap stride (e.g. 15–20%) and tile-boundary Non-Maximum Suppression (NMS) to process arbitrarily large rasters.
- **KML Boundary Clipping**: Optional KML boundary upload to constrain detections strictly to designated property lines, forestry plots, or survey boundaries.
- **Interactive Telemetry Dashboard**: Dark-mode geospatial UI built with React, Tailwind CSS, and Leaflet for real-time inspection, layer toggles, tree inspection modals, and instant data exports.
- **Serverless Cloud GPU Architecture**: Ready-to-deploy Modal integration providing automated GPU scaling (NVIDIA T4 / A10G) with zero idle cost.

---

## Architecture & Pipeline Flow

```
                                  CANOPYLENS PIPELINE ARCHITECTURE
                                  
  [ GeoTIFF / Drone Orthomosaic / RGB Image ]
                     │
                     ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 1. INGESTION & GEODETIC NORMALIZATION                                  │
  │    • Affine Transform & CRS extraction via Rasterio                    │
  │    • Auto-detect optimal UTM Projection (Zone 10N, 17N, etc.)          │
  │    • Ground Sampling Distance (GSD) resolution calculation             │
  │    • Optional KML survey boundary polygon clipping                     │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 2. OVERLAPPING SLIDING-WINDOW TILING                                   │
  │    • Subdivide large orthomosaics into 400×400px tiles                 │
  │    • 15% window stride overlap prevents border tree amputation         │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 3. DEEP LEARNING CANOPY DETECTION & INSTANCE SEGMENTATION              │
  │    • DeepForest RetinaNet (ResNet50) bounding proposals                │
  │    • High-precision SAM2 / contour envelope instance segmentation      │
  │    • Global tile-boundary Non-Maximum Suppression (NMS)                │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 4. GEOMETRIC DISSOLVE & CANOPY TELEMETRY                               │
  │    • Individual Crown Area Sum: ∑ Area(C_i)                            │
  │    • Geometric Union Dissolve: Area( ⋃ C_i ) via Shapely unary_union   │
  │    • Overlap Percentage & Canopy Closure Index calculation             │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 5. CLIENT-READY GIS EXPORTS & INTERACTIVE STUDIO                       │
  │    • WGS84 GeoJSON FeatureCollection (EPSG:4326)                       │
  │    • High-density CSV Telemetry (Centroid Lat/Lon, Area m², Diameter)  │
  │    • Interactive Leaflet Map Visualizer with live polygon inspection   │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
CanopyLens/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── endpoints/
│   │   │       │   ├── analyze.py        # POST /analyze, multipart uploads
│   │   │       │   ├── export.py         # GeoJSON & CSV downloadable exports
│   │   │       │   ├── health.py         # GET /health healthcheck
│   │   │       │   └── jobs.py           # GET /jobs/{id}, status polling
│   │   │       └── router.py             # FastAPI API router aggregation
│   │   ├── core/
│   │   │   └── config.py                 # Pydantic Settings & environment config
│   │   ├── schemas/
│   │   │   ├── analysis.py               # Request/Response validation schemas
│   │   │   └── job.py                    # JobStatus, JobResult models
│   │   ├── services/
│   │   │   ├── counter.py                # Image analysis & counter orchestration
│   │   │   ├── geo.py                    # UTM zones, pyproj, rasterio reprojection
│   │   │   ├── mock.py                   # Realistic deterministic fallback engine
│   │   │   ├── pipeline.py               # DeepForest, SAM2, tiling, unary_union
│   │   │   ├── results.py                # In-memory job store & summary analytics
│   │   │   └── storage.py                # Upload & temporary file management
│   │   └── main.py                       # FastAPI application entrypoint & CORS
│   ├── eval_data/                        # Hand-annotated ground truth benchmark datasets
│   ├── sample_data/                      # Example drone GeoTIFFs and KML boundaries
│   ├── scripts/
│   │   ├── evaluate.py                   # IoU Precision/Recall/F1 benchmark runner
│   │   ├── finetune.py                   # DeepForest model fine-tuning harness
│   │   ├── label_tool.py                 # Lightweight manual annotation tool
│   │   ├── test_failure_cases.py         # Edge-case input validation suite
│   │   └── test_pipeline.py              # CLI end-to-end inference script
│   ├── tests/
│   │   ├── test_api_endpoints.py         # Full REST API endpoint tests
│   │   ├── test_counter.py               # Counter engine tests
│   │   ├── test_finetune_and_eval.py     # Evaluation & fine-tuning script tests
│   │   └── test_pipeline_unit.py         # Tiling, geometry, and dissolve unit tests
│   ├── modal_app.py                      # Serverless GPU deployment on Modal
│   ├── pytest.ini                        # Pytest configuration
│   └── requirements.txt                  # Python dependencies
│
├── frontend/
│   ├── public/
│   │   ├── favicon.svg                   # Emerald Leaf brand icon
│   │   └── orthomosaic_pacific_nw.jpg    # Sample visual imagery
│   ├── src/
│   │   ├── components/
│   │   │   ├── ExportBar.tsx             # Download GeoJSON / CSV action bar
│   │   │   ├── FileBadge.tsx             # Upload file preview with badge status
│   │   │   ├── LandingPage.tsx           # Typographic platform overview & showcase
│   │   │   ├── LeafIcon.tsx              # Reusable emerald brand SVG icon
│   │   │   ├── MapViewer.tsx             # Leaflet GIS vector polygon visualizer
│   │   │   ├── ProcessingPanel.tsx       # Live status polling & stage indicator
│   │   │   ├── ResultsPanel.tsx          # Dual-pane map + telemetry dashboard
│   │   │   ├── StatsPanel.tsx            # Tree count, sum vs union area, metrics
│   │   │   └── UploadPanel.tsx           # Drag-and-drop raster & KML uploader
│   │   ├── lib/
│   │   │   ├── api.ts                    # Strongly typed API client
│   │   │   └── utils.ts                  # Metric formatters and helpers
│   │   ├── pages/
│   │   │   └── Home.tsx                  # Root state machine (Landing vs Studio)
│   │   ├── App.tsx                       # React root component
│   │   ├── index.css                     # Tailwind CSS & custom telemetry theme
│   │   └── main.tsx                      # Vite React mounting point
│   ├── package.json                      # NPM dependencies & scripts
│   ├── tsconfig.json                     # TypeScript compiler configuration
│   └── vite.config.ts                    # Vite build & dev proxy configuration
│
└── README.md                             # Comprehensive technical documentation
```

---

## Prerequisites

Before setting up CanopyLens locally, verify that your machine has the following tools installed:

| Tool | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Python** | `3.11` | `3.11` or `3.12` | Required for FastAPI backend and ML pipeline |
| **Node.js** | `18.0.0` | `20.x` or `24.x` | Required for Vite frontend |
| **npm** | `9.0.0` | `10.x` | Bundled with Node.js |
| **Git** | `2.30+` | Latest | For repository cloning |
| **CUDA** *(Optional)* | `11.8` or `12.1` | `12.1` | For GPU-accelerated local DeepForest / SAM2 |

---

## Local Quickstart & Setup Guide

### 1. Backend Setup

#### Step 1.1: Clone the Repository
```bash
git clone https://github.com/sujayx07/CanopyLens.git
cd CanopyLens/backend
```

#### Step 1.2: Create and Activate Virtual Environment

**On Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**On Windows (Command Prompt):**
```cmd
python -m venv .venv
.\.venv\Scripts\activate.bat
```

**On macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

#### Step 1.3: Install Python Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

> **Note for Windows Users**: Rasterio and Shapely are installed automatically from pre-compiled PyPI wheels. If you encounter any GDAL binding issues, running `pip install --upgrade pip setuptools wheel` prior to `pip install -r requirements.txt` resolves them.

#### Step 1.4: Configure Environment Variables
Create a local `.env` file from the example:

**On Windows:**
```powershell
copy .env.example .env
```

**On macOS / Linux:**
```bash
cp .env.example .env
```

Default configuration in `.env`:
```ini
API_V1_STR=/api/v1
PROJECT_NAME="CanopyLens API"
CORS_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173", "https://canopy-lens.vercel.app"]
UPLOAD_DIR="./uploads"
MAX_UPLOAD_SIZE_MB=500
CONFIDENCE_THRESHOLD=0.3
TILE_SIZE=400
TILE_OVERLAP=0.15
```

#### Step 1.5: Run the Backend Service
```bash
uvicorn app.main:app --reload --port 8000
```

- Backend API: `http://localhost:8000`
- Interactive OpenAPI / Swagger Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health` (returns `{"status": "ok"}`)

---

### 2. Frontend Setup

Open a new terminal window and navigate to the `frontend/` directory:

```bash
cd CanopyLens/frontend
```

#### Step 2.1: Install NPM Dependencies
```bash
npm install
```

#### Step 2.2: Configure Environment Variables
Create a `.env` file in the `frontend/` directory:

```bash
# Point to local backend during development
VITE_API_URL=http://localhost:8000
```

#### Step 2.3: Start the Vite Development Server
```bash
npm run dev
```

Open your browser and navigate to:
```
http://localhost:5173
```

You will see the **CanopyLens Platform Overview** with interactive inspection tools, live sample datasets, and direct access to the analysis workspace.

---

## Cloud Production Deployments

### Modal GPU Deployment (Backend)

CanopyLens provides a native [Modal](https://modal.com/) deployment script (`backend/modal_app.py`) for serverless cloud execution:

- **GPU Acceleration**: Runs on NVIDIA T4 (16 GB VRAM) with automatic scale-to-zero when idle.
- **Pre-baked Image Layers**: Pretrained weights for DeepForest and SAM2 are cached into the container image layer at build time, eliminating cold-start download delays.
- **Persistent Volume**: Uses `modal.Volume` mounted at `/canopylens-data` for large raster uploads.

#### Deployment Steps:
1. Install Modal CLI and log in:
   ```bash
   pip install modal
   modal setup
   ```
2. Deploy the backend from the `backend/` directory:
   ```bash
   cd backend
   modal deploy modal_app.py
   ```
3. Modal will output your live URL:
   ```
   ✔ Created web endpoint: https://<your-workspace>--canopylens-fastapi-app.modal.run
   ```
   Interactive Swagger documentation is available at `https://<your-workspace>--canopylens-fastapi-app.modal.run/docs`.

### Vercel Deployment (Frontend)

The frontend is ready for instant deployment on [Vercel](https://vercel.com/):

1. Link your GitHub repository to Vercel.
2. In **Project Settings**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add Environment Variable:
   - `VITE_API_URL`: Your Modal backend URL (e.g. `https://<your-workspace>--canopylens-fastapi-app.modal.run`).
4. Click **Deploy**.

---

## Pipeline Technical Deep-Dive

### 1. Windowed Tiling & Stride

Processing high-resolution aerial orthomosaics (often exceeding $10,000 \times 10,000$ pixels) in a single forward pass exhausts GPU memory and causes scale distortion. CanopyLens applies a sliding window:

$$\text{Window Size} = 400 \times 400\text{ px}, \quad \text{Stride} = 340\text{ px} \quad (\approx 15\% \text{ overlap})$$

Each window captures boundary context. When bounding boxes from adjacent tiles overlap by more than a specified IoU threshold ($\ge 0.35$), Global Non-Maximum Suppression (NMS) suppresses duplicate detections, preserving whole crowns across tile seams.

### 2. DeepForest Tree Crown Proposals

CanopyLens utilizes DeepForest 2.1, an airborne ecological deep learning framework built on RetinaNet with a ResNet50 feature pyramid backbone:
- Trained on diverse forest biomes from the National Ecological Observatory Network (NEON).
- Candidate bounding boxes identify individual tree locations, width, height, and detection confidence scores.

### 3. Instance Segmentation & Contouring

Rectangular bounding boxes drastically over-estimate tree crown coverage in dense foliage. CanopyLens refines each candidate detection through an instance segmentation stage:
- Extracts multi-spectral color envelopes and gradient boundaries for each candidate.
- Generates precise polygon contours adhering to natural branch boundaries.
- Filters out canvas backgrounds, shadow artifacts, and bare soil.

### 4. Geometric Dissolve vs Sum of Crown Areas

A critical remote sensing metric provided by CanopyLens is the distinction between **Individual Crown Area Sum** and **Geometric Dissolved Canopy Cover**:

| Metric | Calculation | Purpose |
| :--- | :--- | :--- |
| **Sum of Crown Areas** | $\sum_{i=1}^{N} \text{Area}(C_i)$ | Total photosynthetic surface across all individual crowns. Used for allometric biomass and species growth modeling. |
| **Union (Dissolved) Area** | $\text{Area}\left(\bigcup_{i=1}^{N} C_i\right)$ | Ground footprint covered by foliage. Computed via `shapely.ops.unary_union` by geometrically dissolving overlapping polygons. |
| **Canopy Overlap Telemetry** | $\frac{\sum \text{Area} - \text{Union Area}}{\sum \text{Area}} \times 100$ | Quantifies crown collision, interlocking branches, and canopy closure density. |

### 5. Geodetic Reprojection

All pixel measurements are translated into real-world geographic coordinates:
1. **Affine Transform**: Reads pixel coordinates $(x, y)$ and applies the GeoTIFF affine matrix to compute real-world geographic coordinates $(\lambda, \phi)$.
2. **UTM Projection Detection**: Automatically determines the appropriate Universal Transverse Mercator (UTM) zone from coordinates (e.g. UTM Zone 10N for Pacific Northwest, Zone 17N for Florida):
   $$\text{Zone} = \lfloor(\text{longitude} + 180) / 6\rfloor + 1$$
3. **Metric Calculation**: Reprojects to the local UTM CRS (in meters) to calculate exact polygon areas ($\text{m}^2$) and perimeters, avoiding latitude scale distortions inherent in unprojected WGS84.
4. **GeoJSON Export**: Converts resulting polygons to standard WGS84 (EPSG:4326) for universal compatibility with QGIS, ArcGIS, MapLibre, and Leaflet.

---

## REST API Reference

All requests and responses use standard JSON formatting.

### Health Check
```http
GET /health
```
**Response:**
```json
{
  "status": "ok"
}
```

### Submit Analysis Job
```http
POST /api/v1/analyze
Content-Type: multipart/form-data
```

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `file` | File | **Yes** | GeoTIFF (`.tif`, `.tiff`), PNG, JPG, or WebP |
| `kml_file` | File | No | Optional KML boundary polygon for clipping |
| `confidence_threshold` | Float | No | Minimum detection confidence (0.1 to 0.9, default: 0.3) |

**Response (`202 Accepted`):**
```json
{
  "job_id": "c8b671a5-8c0e-4340-843e-32fd64a0e28f",
  "status": "queued",
  "created_at": "2026-09-13T12:00:00Z"
}
```

### Poll Job Status
```http
GET /api/v1/jobs/{job_id}
```
**Response:**
```json
{
  "job_id": "c8b671a5-8c0e-4340-843e-32fd64a0e28f",
  "status": "done",
  "progress": 1.0,
  "error": null
}
```

### Retrieve Analysis Results
```http
GET /api/v1/jobs/{job_id}/result
```
**Response (`200 OK`):**
```json
{
  "job_id": "c8b671a5-8c0e-4340-843e-32fd64a0e28f",
  "summary": {
    "tree_count": 87,
    "total_canopy_area_m2": 3412.50,
    "canopy_cover_percentage": 42.8,
    "mean_crown_area_m2": 39.22,
    "sum_crown_area_px": 213280.0,
    "union_crown_area_px": 196410.0,
    "overlap_percent": 7.91,
    "overlap_area_m2": 269.80,
    "gsd": 0.04,
    "crs": "EPSG:32610",
    "utm_zone": "UTM Zone 10N"
  },
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": 1,
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-122.189, 45.312], [-122.188, 45.312], [-122.188, 45.311], [-122.189, 45.312]]]
        },
        "properties": {
          "id": 1,
          "area_m2": 42.15,
          "perimeter_m": 24.3,
          "diameter_m": 7.32,
          "confidence": 0.91,
          "centroid_lat": 45.3118,
          "centroid_lon": -122.1887
        }
      }
    ]
  }
}
```

### Export GeoJSON / CSV
```http
GET /api/v1/jobs/{job_id}/export/geojson
GET /api/v1/jobs/{job_id}/export/csv
```
Downloads the complete geospatial vector set as a `.geojson` or tabular `.csv` file.

---

## Evaluation & Fine-Tuning Harness

The `backend/scripts/` directory contains tools to evaluate, benchmark, and fine-tune models against real ground truth forestry datasets:

### 1. Evaluate Model on Ground Truth Benchmark
Evaluates detection predictions against hand-labeled bounding boxes in `backend/eval_data/` and computes IoU, Precision, Recall, and F1-score:

```bash
cd backend
python scripts/evaluate.py --data-dir eval_data/ --iou-threshold 0.4
```

Output includes detailed confusion metrics per evaluation tile:
```
============================================================
CANOPYLENS BENCHMARK EVALUATION SUMMARY
============================================================
Total Ground Truth Crowns : 248
Total Predicted Crowns    : 256
True Positives (TP)       : 224
False Positives (FP)      : 32
False Negatives (FN)      : 24
------------------------------------------------------------
Precision                 : 0.8750
Recall                    : 0.9032
F1 Score                  : 0.8889
Mean IoU (Matched)        : 0.6841
============================================================
```

### 2. Fine-Tune on Custom Imagery
Fine-tunes the DeepForest backbone on localized aerial data using DeepForest's PyTorch Lightning trainer:

```bash
cd backend
python scripts/finetune.py \
    --train-csv eval_data/train_annotations.csv \
    --val-csv eval_data/val_annotations.csv \
    --epochs 10 \
    --lr 0.0001 \
    --output-dir checkpoints/
```

### 3. Command-Line Direct Inference
Run inference on any local GeoTIFF file directly from your terminal:

```bash
cd backend
python scripts/test_pipeline.py \
    --image sample_data/sample_forest.tif \
    --kml sample_data/boundary.kml \
    --output output_results.geojson
```

---

## Testing & Quality Assurance

CanopyLens includes an extensive automated test suite covering API contracts, geospatial math, pipeline windowing, and edge-case handling.

### Running Backend Tests
From the `backend/` directory:

```bash
cd backend
python -m pytest tests/
```

```
============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.3.5, pluggy-1.5.0
collected 39 items

tests/test_api_endpoints.py ....................                         [ 51%]
tests/test_counter.py .....                                              [ 64%]
tests/test_finetune_and_eval.py .....                                    [ 76%]
tests/test_pipeline_unit.py .........                                    [100%]

======================= 39 passed in 3.02s ========================
```

### Running Frontend Verification
From the `frontend/` directory:

```bash
cd frontend
npm run build
```
Executes TypeScript compilation (`tsc`) and generates optimized production distribution bundles via Vite.

---

## Troubleshooting & FAQs

### Q: `rasterio` or `GDAL` fails to install on Windows.
**A**: Ensure your pip is up to date:
```powershell
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```
Modern PyPI wheels provide pre-compiled binary wheels for Rasterio, Shapely, and PyProj on Windows, requiring no manual C++ compiler.

### Q: Why does the analysis show both "Sum of Crown Areas" and "Union Area"?
**A**: In natural forests, individual tree canopies overlap significantly. Summing individual crown areas counts overlapping canopy volume twice, which is useful for individual tree biomass allometry. The dissolved Union Area calculates the true ground footprint without overlap, which is required for canopy cover percentage benchmarks. CanopyLens reports both numbers and their exact overlap percentage.

### Q: Can CanopyLens process standard non-georeferenced images (JPG/PNG)?
**A**: Yes. If an image lacks geospatial metadata, CanopyLens automatically applies standard pixel-to-metric scaling based on standard drone GSD estimates ($0.04\text{ m/px}$) and generates a relative coordinate grid so you still obtain accurate metric areas.

### Q: How do I increase the upload file size limit?
**A**: Edit `MAX_UPLOAD_SIZE_MB` in `backend/.env` (default: 500 MB).

---

## License & Acknowledgments

CanopyLens is open-source software released under the [MIT License](LICENSE).

### Acknowledgments
- **[DeepForest](https://github.com/weecology/DeepForest)**: Individual tree crown detection in airborne RGB imagery (Weecology Lab).
- **[Meta AI SAM2](https://github.com/facebookresearch/segment-anything-2)**: Segment Anything in Images and Videos.
- **[Rasterio](https://github.com/rasterio/rasterio)** & **[Shapely](https://github.com/shapely/shapely)**: Geospatial raster I/O and planar geometry manipulation.
- **[Leaflet](https://leafletjs.com/)** & **[Tailwind CSS](https://tailwindcss.com/)**: Geospatial visualization and design styling.

---

<div align="center">
  <sub>Built for precision forestry, biodiversity conservation, and ecological spatial intelligence.</sub>
</div>
