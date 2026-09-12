# CanopyLens

Tree crown detection & canopy area tool. Detect trees in aerial/satellite imagery, measure crown areas, and report honest confidence.

Monorepo layout:

```
/backend   FastAPI service (Python 3.11 recommended)
/frontend  React (Vite) + TypeScript + Tailwind CSS single-page app
```

## Prerequisites

- Python 3.11 (3.12 should also work)
- Node.js 18+ (v24 tested)

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

# copy env defaults (edit if needed)
copy .env.example .env

uvicorn app.main:app --reload --port 8000
```

API is served at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`. Health check: `GET http://localhost:8000/health` → `{"status": "ok"}`.

Endpoints:

```
POST /analyze                  multipart (image [+ optional kml]) → {"job_id": "..."}
GET  /jobs/{job_id}            status: queued|processing|done|failed (+ error)
GET  /jobs/{job_id}/result     GeoJSON FeatureCollection + summary (409 until done)
GET  /jobs/{job_id}/export/geojson   downloadable .geojson
GET  /jobs/{job_id}/export/csv       downloadable .csv
```

Jobs run in-process via FastAPI `BackgroundTasks` (no Celery/Redis). Uploads are stored in `backend/uploads/` (gitignored). Results are computed live from the pipeline — nothing persists across restarts except uploaded files.

> Note: `requirements.txt` includes heavy ML deps (`torch`, `torchvision`, `deepforest`). The first `pip install` downloads several GB — do it once, offline afterwards.

### Tests

Unit tests cover the pure pipeline logic (tiling windows, confidence scoring, UTM zone, pixel-area math, KML parsing) and need only the light deps:

```bash
cd backend
pytest
```

The full ML integration can be run once a sample image is placed in `backend/sample_data/` (and after `pip install` of everything):

```bash
cd backend
python scripts/test_pipeline.py --image sample_data/<your-image>.tif       # optional: --kml sample_data/boundary.kml
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Dev server runs at `http://localhost:5173` and proxies API calls to `VITE_API_URL` (default `http://localhost:8000`). Configure via `frontend/.env` (see `.env.example`).

## Status

Scaffolding only — no detection logic yet.