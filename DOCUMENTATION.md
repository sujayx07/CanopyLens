# CanopyLens — Complete Technical & Architectural Documentation
### End-to-End AI Aerial Tree Crown Detection, Instance Segmentation & Canopy Telemetry Platform

---

## 1. Executive Summary & Abstract

**CanopyLens** is an open-source, production-grade geospatial artificial intelligence platform designed to extract high-fidelity ecological intelligence from airborne photogrammetry (UAV/drone orthomosaics, aerial surveys, and high-resolution satellite imagery).

Traditional forestry surveys rely on either cost-prohibitive airborne LiDAR campaigns or manual timber cruising—both of which fail to provide real-time, scalable data across large landscapes. Conversely, naive computer vision solutions treat canopy detection as a generic object detection problem, producing rectangular bounding boxes that overestimate tree crown area, fail to resolve interlocking canopies, and ignore geodetic coordinate reference system (CRS) distortions.

CanopyLens introduces an end-to-end, two-stage deep learning and computational geometry architecture:
1. **Detection Stage**: DeepForest 2.1 (RetinaNet with ResNet50-FPN) identifies individual tree crown bounding proposals across sliding-window raster tiles with spatial overlap.
2. **Segmentation Stage**: Meta's Segment Anything Model 2 (**SAM2 Hiera-Small**) refines proposals into organic, pixel-precise polygon contours representing true crown drip lines.
3. **Computational Geometry Stage**: Employs Shapely's planar geometry engine (`shapely.ops.unary_union`) to calculate both **Raw Sum of Individual Crown Areas** and **Dissolved Non-Overlapping Canopy Union**, quantifying exact canopy overlap percentages.
4. **Geodetic Stage**: Extracts GeoTIFF affine transforms, automatically projects coordinates to the optimal local Universal Transverse Mercator (**UTM**) zone for distortion-free metric ($\text{m}^2$, hectares) calculations, and reprojects vector outputs into standard **WGS84 (EPSG:4326)** GeoJSON and CSV formats.

---

## 2. Problem Statement & Domain Challenges

Quantifying individual tree crowns (ITC) and canopy cover from aerial imagery poses severe remote sensing, cartographic, and computational hurdles:

### 2.1 The Fallacy of Pixel Vegetation Indices (NDVI)
Historically, aerial vegetation mapping relied on spectral thresholding (e.g., Normalized Difference Vegetation Index — NDVI). While NDVI indicates the presence of chlorophyll, it:
* Fails to distinguish individual tree boundaries in continuous forest stands.
* Misclassifies grass, ground cover, underbrush, and agricultural crops as forest canopy.
* Provides zero allometric data on crown count, individual crown diameters, or canopy spacing.

### 2.2 The Bounding Box Dilemma
Generic object detection models (such as YOLO or Faster R-CNN) output rectangular bounding boxes (`xmin, ymin, xmax, ymax`). In forestry:
$$\text{Area}_{\text{box}} = w \times h \gg \text{Area}_{\text{crown}} \approx \pi \cdot \frac{w}{2} \cdot \frac{h}{2} \approx 0.785 \times \text{Area}_{\text{box}}$$
A rectangular box overestimates single crown area by **$25\text{--}45\%$** and captures surrounding bare ground, shadows, and roads.

### 2.3 Canopy Overlap & Crown Interlocking
In natural forests, branches of neighboring trees interlock. A naive summation of detected crown areas:
$$\text{Area}_{\text{sum}} = \sum_{i=1}^{N} \text{Area}(C_i)$$
double-counts overlapping canopy surface. Conversely, merging all crowns into a single blob loses individual tree counts and size distributions. Remote sensing workflows require **both metrics independently**:
* **Individual Crown Area Sum ($\sum \text{Area}$)**: Required for allometric biomass, carbon modeling, and tree health tracking.
* **Geometric Union ($\bigcup C_i$)**: Required for canopy cover percentage, ground shade footprint, and forestry closure classification.

### 2.4 Cartographic & Geodetic Distortion
Aerial imagery is captured in degrees (WGS84 EPSG:4326) or projected coordinate systems. Computing area in unprojected angular units ($\text{deg}^2$) leads to extreme distortion because the ground length of a longitudinal degree shrinks with latitude:
$$\Delta x = \Delta \lambda \cdot R \cos(\phi)$$
Without dynamically reprojecting raster and vector geometries to a metric planar projection (local UTM Zone), measured areas can be distorted by **$30\text{--}60\%$** away from the equator.

### 2.5 Gigapixel Raster Tiling & Boundary Truncation
Drone orthomosaics frequently exceed $10,000 \times 10,000$ pixels ($>500\text{ MB}$). Feeding such images directly into modern neural networks causes Out-Of-Memory (OOM) GPU crashes. However, naive grid slicing cuts trees in half at tile borders, generating duplicate detections and severed polygons.

### 2.6 The "Honesty Problem" in Remote Sensing AI
Most automated AI tools generate confident-looking outputs without acknowledging uncertainty, sensor limitations, or resolution thresholds. Forestry professionals, carbon auditors, and land managers reject "black box" tools that fabricate numbers.

---

## 3. The Proposed Solution: CanopyLens

CanopyLens addresses these challenges through a unified, production-ready software architecture:

```
+-----------------------------------------------------------------------------------+
|                               CANOPYLENS SOLUTION                                 |
+-----------------------------------------------------------------------------------+
|  1. Robust Ingestion      | Rasterio-powered GeoTIFF parser, affine transform,    |
|                           | GSD calculation, and optional KML plot boundary clip. |
|  2. Overlapping Tiling    | Sliding window (400x400) with 15% overlap stride to   |
|                           | ensure zero boundary truncation of edge trees.        |
|  3. Two-Stage Vision      | DeepForest (RetinaNet) proposals + SAM2 organic       |
|                           | instance segmentation + spectral ExG verification.    |
|  4. Pre-Clustering & NMS  | Merges adjacent fragments & global NMS (IoU >= 0.35)  |
|                           | across tile seams.                                    |
|  5. Geometric Dissolve    | Computes both Crown Area Sum and Dissolved Union Area |
|                           | via Shapely unary_union, reporting Overlap %.         |
|  6. Dynamic UTM Geodesy   | Inters local UTM zone from centroid (e.g. UTM 10N)    |
|                           | to calculate true physical m² and hectares.           |
|  7. Calibrated Trust      | Explicit confidence buckets (High/Med/Low), visible   |
|                           | limitations panel, and standard GeoJSON/CSV exports.  |
+-----------------------------------------------------------------------------------+
```

---

## 4. Technical Stack & Component Rationale

| Layer | Technology | Version | Architectural Rationale |
| :--- | :--- | :--- | :--- |
| **Backend Framework** | **FastAPI** | `^0.115.0` | Asynchronous ASGI framework; high throughput; native Pydantic v2 data validation; non-blocking background job orchestration without external message queue overhead. |
| **Server Engine** | **Uvicorn** | `^0.34.0` | Production ASGI web server implementation for Python. |
| **Object Detection** | **DeepForest** | `^2.1.0` | Purpose-built RetinaNet with ResNet50 backbone trained on National Ecological Observatory Network (NEON) airborne forestry datasets. |
| **Instance Segmentation** | **Meta SAM2** (`hiera-small`) | HuggingFace | Zero-shot promptable instance segmentation. Turns bounding proposals into organic, branch-accurate polygon contours. |
| **Computer Vision** | **OpenCV (`cv2`)** & **NumPy** | `^4.10.0` / `^2.0.0` | Rapid image tensor conversions, Otsu adaptive thresholding, Excess Green ($\text{ExG}$) spectral verification, and `approxPolyDP` contour simplification. |
| **Geospatial Raster I/O** | **Rasterio** / **GDAL** | `^1.4.0` | Reads multi-spectral bands, affine transformation matrices, NoData masks, and raster spatial bounds. |
| **Planar Geometry** | **Shapely** | `^2.0.0` | Fast GEOS-backed planar polygon operations: unary union, spatial intersection, perimeter, centroid, and area math. |
| **Geodesy & Reprojection** | **PyProj** | `^3.7.0` | PROJ coordinate transformation engine for high-precision conversion between WGS84 (EPSG:4326) and local UTM zones (EPSG:326xx). |
| **Deep Learning Engine** | **PyTorch** & **TorchVision** | `^2.0.0` | PyTorch execution graph; CUDA acceleration; `torchvision.ops.nms` for cross-tile non-maximum suppression. |
| **Frontend Framework** | **React 18** | `18.3.1` | Declarative UI state machine managing Landing, Upload, Polling, and Results views. |
| **Language & Tooling** | **TypeScript** & **Vite** | `^5.0.0` / `^8.0.0` | Strict type safety across API schemas; ultra-fast Rollup-based production compilation. |
| **CSS & Design System** | **Tailwind CSS v4** | `^4.0.0` | Hardware-accelerated dark telemetry aesthetic; custom typography; responsive grid system. |
| **Interactive Map** | **MapLibre GL** | `^5.1.0` | High-performance WebGL vector/raster GIS viewer supporting dynamic GeoJSON layers, bounding box fits, and polygon click popups. |
| **Map Basemap Provider** | **CARTO Dark Matter** | CDN / API v3 | Clean, dark-mode cartographic tiles with authenticated API key support (`?api_key=...`), ensuring high visual contrast for emerald tree crowns. |
| **Cloud GPU Backend** | **Modal** | Serverless | Serverless GPU execution on NVIDIA T4/A10G with baked container image layers for model weights; zero cold idle cost. |
| **Frontend CDN** | **Vercel** | Edge Network | Global edge hosting, automatic asset optimization, and instant preview deployments. |

---

## 5. Technical Approach & 7-Stage Pipeline

```
+----------------------------------------------------------------------------------------------------+
|                                    DETAILED 7-STAGE PIPELINE                                       |
+----------------------------------------------------------------------------------------------------+

   [ Orthomosaic / GeoTIFF ] 
              │
              ▼
   ┌─────────────────────────────────────────────────────────┐
   │ STAGE 1: INGESTION, AFFINE EXTRACTION & VALIDATION      │
   │ • Rasterio opens raster; extracts width, height, bands  │
   │ • Reads Affine transform matrix: [a, b, c, d, e, f]     │
   │ • Computes GSD (Ground Sampling Distance in meters/px)  │
   │ • Optional KML boundary polygon parsed & clipped        │
   └────────────────────────────┬────────────────────────────┘
                                │
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ STAGE 2: OVERLAPPING SLIDING-WINDOW TILING              │
   │ • Window size = 400 × 400 px, Overlap = 15% (stride 340)│
   │ • Handles arbitrary gigapixel orthomosaics              │
   │ • Tags edge proximity on bounding detections           │
   └────────────────────────────┬────────────────────────────┘
                                │
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ STAGE 3: DEEPFOREST DETECTION & SPECTRAL VERIFICATION   │
   │ • RetinaNet (ResNet50-FPN) runs inference per tile      │
   │ • ExG vegetation check: ExG = 2G - R - B                │
   │ • Discards false positives (roads, roofs, bare ground)  │
   │ • CV fallback (adaptive Hough + Otsu) if GPU offline    │
   └────────────────────────────┬────────────────────────────┘
                                │
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ STAGE 4: GLOBAL CROSS-TILE NMS & PRE-CLUSTERING         │
   │ • Translates tile coordinates (x, y) to full image grid │
   │ • Global NMS (torchvision.ops.nms) with IoU = 0.35      │
   │ • Clusters fragment bounding boxes of same tree         │
   └────────────────────────────┬────────────────────────────┘
                                │
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ STAGE 5: SAM2 ORGANIC INSTANCE SEGMENTATION             │
   │ • Meta SAM2 Hiera-Small prompted by bounding boxes      │
   │ • Generates organic crown envelope (branch drip line)   │
   │ • Polygon contour extraction via cv2.approxPolyDP       │
   │ • Filters out fragments < 5% of median crown area       │
   └────────────────────────────┬────────────────────────────┘
                                │
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ STAGE 6: GEOMETRIC DISSOLVE & CANOPY TELEMETRY          │
   │ • Raw Sum of Individual Crown Areas: ∑ Area(C_i)        │
   │ • Dissolved Non-Overlapping Canopy: Area(⋃ C_i)         │
   │ • Overlap Area = Sum - Union, Overlap % calculated      │
   │ • Canopy Cover % = Union Area / Total Analyzed Area     │
   └────────────────────────────┬────────────────────────────┘
                                │
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ STAGE 7: GEODETIC UTM REPROJECTION & GIS EXPORTS        │
   │ • Auto-detects UTM Zone: Zone = floor((lon + 180)/6) + 1│
   │ • PyProj reprojects geometries to metric UTM (m²)       │
   │ • Outputs WGS84 GeoJSON FeatureCollection (EPSG:4326)   │
   │ • Generates tabular CSV telemetry table                 │
   └─────────────────────────────────────────────────────────┘
```

### Stage 1: Ingestion, Affine Extraction & Georeferencing
* Uses `rasterio.open(path)` to inspect coordinate reference systems (`ds.crs`), affine transforms (`ds.transform`), and ground resolution (`ds.res`).
* If an optional KML boundary is provided, CanopyLens parses `<LinearRing>` coordinates, constructs a Shapely polygon, and transforms it into the raster's native CRS to clip the analysis zone.

### Stage 2: Sliding-Window Tiling with Overlap Stride
* Raster tiling breaks a massive raster into manageable chunks:
  $$\text{step} = \max(\lfloor\text{tile\_size} \times (1.0 - \text{overlap})\rfloor, 1)$$
* A $400 \times 400$ tile with $15\%$ overlap yields a step size of $340$ pixels. A $60$-pixel boundary buffer ensures crowns split across tile borders appear fully within at least one tile.

### Stage 3: DeepForest Detection & Spectral Verification
* DeepForest passes each tile through its feature pyramid network. For detections near the confidence floor ($<0.25$), a spectral verification gate calculates the **Excess Green Index**:
  $$\text{ExG} = 2 \cdot G - R - B$$
  Detections exhibiting negative ExG and low green ratios are discarded as non-vegetation false positives.

### Stage 4: Global Tile-Boundary NMS & Pre-Clustering
* Local tile coordinates $(x_{\text{tile}}, y_{\text{tile}})$ are translated to absolute full-image coordinates $(x + \text{offset}_x, y + \text{offset}_y)$.
* `torchvision.ops.nms` evaluates all bounding boxes across the entire image at an IoU threshold of $0.35$.
* `cluster_detection_boxes()` merges adjacent box fragments of the same crown before passing them to the segmentation model.

### Stage 5: Organic Instance Segmentation (Meta SAM2)
* SAM2 (`facebook/sam2-hiera-small`) receives the image and candidate bounding box prompts.
* The predicted binary mask is converted to vector contours using OpenCV's `findContours`.
* Contour simplification via Douglas-Peucker algorithm (`cv2.approxPolyDP(cnt, 0.02 * perimeter, True)`) produces clean, compact polygon geometries.
* Small fragments ($<5\%$ of median crown area) are filtered out to eliminate spurious leaf clusters.

### Stage 6: Geometric Dissolve & Canopy Overlap Analytics
* Individual polygons are represented as Shapely geometries.
* **Sum of Crown Areas**:
  $$A_{\text{sum}} = \sum_{i=1}^{N} \text{Area}(P_i)$$
* **Union Area (Dissolved Footprint)**:
  $$A_{\text{union}} = \text{Area}\left(\bigcup_{i=1}^{N} P_i\right) = \text{Area}(\text{shapely.ops.unary\_union}(\mathbf{P}))$$
* **Canopy Overlap Telemetry**:
  $$\text{Overlap Area} = A_{\text{sum}} - A_{\text{union}}$$
  $$\text{Overlap Percentage} = \frac{A_{\text{sum}} - A_{\text{union}}}{A_{\text{sum}}} \times 100\%$$
* **Canopy Cover Percentage**:
  $$\text{Canopy Cover \%} = \frac{A_{\text{union}}}{A_{\text{analyzed}}} \times 100\%$$

### Stage 7: Planar Geodesy & UTM Reprojection
* Automatically computes the EPSG code for the appropriate UTM Zone:
  $$\text{UTM Zone} = \left\lfloor\frac{\text{longitude} + 180}{6}\right\rfloor + 1$$
  $$\text{EPSG} = \begin{cases} 32600 + \text{Zone} & \text{if latitude } \ge 0 \text{ (Northern Hemisphere)} \\ 32700 + \text{Zone} & \text{if latitude } < 0 \text{ (Southern Hemisphere)} \end{cases}$$
* Reprojects polygon vertices using `pyproj.Transformer` from native raster CRS to metric UTM coordinates to calculate exact square meters ($\text{m}^2$).
* Formats final vector features into standard WGS84 (EPSG:4326) GeoJSON with properties:
  `{ id, area_m2, perimeter_m, diameter_m, confidence, centroid_lat, centroid_lon }`.

---

## 6. System Architecture & Component Interactions

```
+---------------------------------------------------------------------------------------+
|                               SYSTEM ARCHITECTURE TOPOLOGY                            |
+---------------------------------------------------------------------------------------+

   CLIENT LAYER (React 18 + TypeScript + Vite + Tailwind CSS v4)
   ┌───────────────────────────────┐     ┌──────────────────────────────┐
   │      LandingPage.tsx          │     │       ResultsPanel.tsx       │
   │  • Platform Hero & Overview   │     │  • MapLibre GL Interactive   │
   │  • Typographic Showcase       │     │  • CARTO Dark Matter Basemap │
   │  • Instant Demo Launch        │     │  • Telemetry Dashboard Cards │
   └───────────────┬───────────────┘     └──────────────┬───────────────┘
                   │                                    │
                   ▼                                    ▼
   REST API GATEWAY (FastAPI / Uvicorn ASGI Server)
   ┌────────────────────────────────────────────────────────────────────┐
   │  Endpoints:                                                        │
   │  • POST /api/v1/analyze          • GET /api/v1/jobs/{id}/result    │
   │  • GET  /api/v1/jobs/{id}        • GET /api/v1/jobs/{id}/export/*  │
   │  • GET  /health                  • CORS Middleware Security        │
   └─────────────────────────────────┬──────────────────────────────────┘
                                     │
                                     ▼
   ORCHESTRATION & IN-MEMORY JOB STORE (FastAPI BackgroundTasks)
   ┌────────────────────────────────────────────────────────────────────┐
   │  JobStore (Dict + Threading.Lock)                                  │
   │  States: queued ──> processing ──> done (or failed)                │
   │  JobRecord: { status, progress, image_meta, result, error }        │
   └─────────────────────────────────┬──────────────────────────────────┘
                                     │
                                     ▼
   VISION & GEOSPATIAL PIPELINE ENGINE (pipeline.py, geo.py, results.py)
   ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────┐
   │ DeepForest 2.1          │  │ Meta SAM2 (Hiera-Small) │  │ Shapely │
   │ RetinaNet / ResNet50    │  │ Prompted Contouring     │  │ GEOS    │
   └────────────┬────────────┘  └────────────┬────────────┘  └────┬────┘
                │                            │                    │
                ▼                            ▼                    ▼
   INFRASTRUCTURE & HOSTING LAYER
   ┌────────────────────────────────────────────────────────────────────┐
   │  • Backend Host: Modal Serverless GPU (NVIDIA T4, 16GB VRAM)      │
   │  • Storage: Modal Volume mounted at /canopylens-data               │
   │  • Frontend Host: Vercel Global Edge Network                       │
   │  • Basemap Provider: CARTO Spatial CDN (https://*.cartocdn.com)    │
   └────────────────────────────────────────────────────────────────────┘
```

---

## 7. Feasibility Analysis

### 7.1 Technical Feasibility
* **Inference Runtime**: DeepForest inference averages **$45\text{--}80\text{ ms}$** per $400 \times 400$ tile on an NVIDIA T4 GPU ($350\text{--}600\text{ ms}$ on modern multi-core CPU). A typical $2,000 \times 2,000$ drone plot divides into $\approx 36$ tiles, completing inference in under **$4\text{ seconds}$** on GPU.
* **VRAM Footprint**:
  * DeepForest RetinaNet weights: $\approx 145\text{ MB}$.
  * SAM2 Hiera-Small weights: $\approx 160\text{ MB}$.
  * Peak execution VRAM: $\approx 2.4\text{ GB}$ (comfortably within the $16\text{ GB}$ ceiling of an entry-level NVIDIA T4 GPU).
* **Memory Management**: Streaming window reads via `rasterio.windows.Window` eliminate the requirement to load entire multi-gigabyte orthomosaics into RAM simultaneously.

### 7.2 Operational Feasibility
* **Zero Cold-Start Model Baking**: The deployment configuration (`backend/modal_app.py`) runs `_download_models()` during container image construction. DeepForest and HuggingFace weights are baked directly into the container layer, completely eliminating multi-gigabyte downloads during cold starts.
* **Reproducibility**: Standardized Python dependencies (`requirements.txt`) and Node packaging (`package.json`) allow complete local setup in under 5 minutes on Windows, macOS, or Linux.

### 7.3 Economic Feasibility
* **Cost Comparison per 100-Hectare Survey**:
  * Traditional Manual Timber Cruise: **$\$3,000\text{--}\$7,500$** (requires 2–4 field foresters over 3–5 days).
  * Commercial Aerial LiDAR Campaign: **$\$5,000\text{--}\$12,000$** (specialized aircraft flight + post-processing).
  * CanopyLens Automated Drone Analysis: **$<\$0.50$** in serverless GPU compute runtime.

---

## 8. Viability & Industry Applications

CanopyLens provides direct commercial and scientific viability across five key sectors:

### 8.1 Carbon Offset Verification (MRV)
Voluntary carbon market registries (e.g., Verra VCS, Gold Standard, American Carbon Registry) require rigorous **Measurement, Reporting, and Verification (MRV)** of forest carbon stocks:
* CanopyLens outputs auditable vector polygons with clear confidence metrics rather than opaque estimates.
* Distinguishing between individual crown area and dissolved canopy cover prevents fraudulent double-counting of biomass in dense canopies.

### 8.2 Commercial Forestry & Plantation Management
* **Inventory Stocking Rate**: Automates post-planting survival counts in commercial timber stands (pine, eucalyptus, teak).
* **Thinning Operations**: Identifies overgrown clusters requiring selective harvest to maximize individual tree diameter growth.

### 8.3 Municipal Urban Forestry
* **Canopy Goal Benchmarking**: Cities worldwide target specific canopy cover goals (e.g., $30\%$ urban canopy cover). CanopyLens calculates exact canopy percentage within designated neighborhood boundaries or cadastral parcels.
* **Hazard Tree Identification**: Flags anomalous isolated trees encroaching on utility rights-of-way or building structures.

### 8.4 Wildfire Fuel-Load & Canopy Bulk Density
* Continuous, interlocking canopies facilitate high-intensity crown fires. CanopyLens's **Overlap Percentage** metric directly quantifies horizontal fuel continuity, enabling fire agencies to map high-risk fire corridors.

### 8.5 Agricultural Orchard Inventory
* Automates tree counting, missing tree detection, and crown vigor monitoring in commercial fruit and nut orchards (citrus, avocado, almond).

---

## 9. Methodological Limitations & Failure Modes

In accordance with CanopyLens's core design philosophy—*transparency over false precision*—the following known limitations and operational failure modes are documented:

```
+------------------------------------------------------------------------------------------------+
|                             LIMITATIONS & FAILURE MODES MATRIX                                 |
+------------------------------------------------------------------------------------------------+
| Condition                      | Observed Impact          | Mitigation / Best Practice         |
+--------------------------------+--------------------------+------------------------------------+
| Closed-Canopy Rainforests      | Undercounting trees;     | Calibrated overlap reporting;      |
| (Continuous dense interlocking)| interlocking canopies    | manual split adjustment in GIS;    |
|                                | merge into single crowns | LiDAR CHM fusion for v2.           |
+--------------------------------+--------------------------+------------------------------------+
| Leaf-Off Winter Deciduous      | Severe apparent crown    | Multi-temporal summertime imagery; |
| (Bare branches during dormancy)| shrinkage; dropped score | seasonal phenology calibration.    |
+--------------------------------+--------------------------+------------------------------------+
| High Off-Nadir Drone Tilt      | Parallax distortion;     | Restrict surveys to nadir imagery  |
| (> 25° camera gimbal tilt)     | severe shadow occlusion  | (gimbal pitch: -90° ± 5°).         |
+--------------------------------+--------------------------+------------------------------------+
| Sub-Canopy Understory Saplings | Completely obscured by   | Documented as dominant canopy only;|
| (Juvenile trees beneath mature)| mature overstory canopy  | ground-truth timber cruise survey. |
+--------------------------------+--------------------------+------------------------------------+
| Low Resolution Imagery         | Missed small crowns;     | Minimum recommended resolution:    |
| (GSD > 15 cm/pixel)            | blurry boundary contours | GSD <= 8 cm/pixel.                 |
+--------------------------------+--------------------------+------------------------------------+
| Non-Georeferenced Rasters      | Metric areas unavailable;| System outputs pixel areas (px²)   |
| (Standard JPG/PNG without CRS) | canopy cover % shows N/A | with explicit user notification.   |
+--------------------------------+--------------------------+------------------------------------+
```

---

## 10. Quality Assurance & Verification Matrix

CanopyLens maintains rigorous automated testing and benchmark validation:

### 10.1 Automated Test Suite (39 Passing Unit & Integration Tests)
The test suite in `backend/tests/` covers all critical architectural components:
* `tests/test_pipeline_unit.py`: Sliding-window tile math, overlap step validation, geodetic UTM zone selection, polygon dissolution (`unary_union`), and confidence scoring heuristics.
* `tests/test_api_endpoints.py`: Multipart file uploads, input sanitization, background job lifecycle (`queued` $\to$ `processing` $\to$ `done`), GeoJSON schema compliance, and downloadable CSV generation.
* `tests/test_counter.py`: Spectral ExG calculations, image preparation, and detection count parity.
* `tests/test_finetune_and_eval.py`: Annotation CSV converters, train/validation split logic, and IoU matching algorithms.

```bash
# Execute backend test suite
cd backend
python -m pytest tests/
# Result: 39 passed in 2.23s
```

### 10.2 Ground Truth Benchmark Evaluation Harness
The CLI script `backend/scripts/evaluate.py` benchmarks model predictions against hand-annotated ground-truth bounding boxes in `backend/eval_data/`:
* Calculates **Intersection-over-Union (IoU)** matching matrices.
* Outputs rigorous precision, recall, and F1 scores across diverse canopy densities.

```bash
python scripts/evaluate.py --data-dir eval_data/ --iou-threshold 0.4
```

### 10.3 Frontend Compilation & Type Verification
The frontend passes strict TypeScript compilation and production asset bundling via Vite:

```bash
cd frontend
npm run build
# Result: 0 errors, 87 modules transformed, optimized production bundle generated.
```

---

## 11. Future Roadmap & Extensibility

1. **LiDAR & Canopy Height Model (CHM) Fusion**: Ingest raster Digital Surface Models (DSM) and Digital Terrain Models (DTM) alongside RGB imagery to extract individual tree heights ($h$) and calculate 3D volumetric biomass:
   $$V_{\text{tree}} = \frac{1}{3} \cdot \pi \cdot r^2 \cdot h$$
2. **Multi-Temporal Change Detection**: Ingest co-registered flight mosaics across multiple seasons or years to automatically flag illegal logging, storm windthrow, and individual tree growth rates.
3. **Multispectral Stress & Phenology Analytics**: Support 5-band multispectral sensors (Red, Green, Blue, Red-Edge, Near-Infrared) to compute automated NDVI, NDRE, and chlorophyll stress indices per individual tree crown.
4. **PostGIS Enterprise Persistence**: Replace the demo in-memory `JobStore` with a containerized PostGIS / SQLite backend for multi-tenant, enterprise-scale survey tracking.

---

<div align="center">
  <b>CanopyLens Spatial Intelligence</b> • <i>Precision Forestry & Ecological AI</i>
</div>
