# CanopyLens — Build Plan
### Tree Crown Detection & Canopy Area Tool — Weekend Build (Deadline: Mon 14 Sep, 11:59 PM IST)

All four AI outputs converge on the same answer. This document picks the ONE version of each decision that is actually buildable solo in a weekend, and cuts everything that isn't. No option-comparisons left in — just what to build.

---

## 0. The one idea that wins this

The brief literally says: *"a rough tool that admits what it can't do is more valuable than a polished one that invents numbers."*

So the product is not "a tree counter." It's **a tree counter that tells you when to trust it** — confidence scores, a visible limitations panel, human correction, and honest area math (sum vs. union). That's the whole differentiation strategy. Everything below serves that one idea. Do not add species ID, carbon/AGB estimates, or change-detection unless Saturday's core pipeline is done early — they're stretch, not scope.

---

## 1. Final tech stack (decided, not optional)

| Layer | Choice | Why this one, not the alternatives |
|---|---|---|
| Detection | **DeepForest** (`weecology/deepforest-tree`, pip install) | Only pretrained, zero-training-needed tree-crown detector with a working HF checkpoint. All 4 sources agree on this as the safe baseline. |
| Segmentation (crown masks) | **SAM2** (`facebook/sam2-hiera-small`), prompted by DeepForest boxes | This exact "detect-then-segment" pipeline is a published Aug-2026 paper result (annotation-free, works across biomes). Turns boxes into real crown polygons → real area. |
| Backend | **FastAPI**, single service, background task (not Celery — one solo dev, one weekend, skip the queue infra) | Async endpoint + polling is enough. Redis/Celery adds ops risk with zero benefit at this scale. |
| Geospatial | `rasterio`, `shapely`, `geopandas`, `pyproj` | Standard, non-negotiable for CRS-correct area math. |
| Model hosting | **Modal** (serverless GPU, generous free tier) for inference; fallback **HF Spaces (ZeroGPU)** if Modal setup eats time | Both free. Modal is cleaner for a real API; HF Spaces is faster to get a link live — pick Modal first, keep HF Spaces as the emergency fallback for Sunday night. |
| Frontend | **React (Vite) + MapLibre GL + Tailwind** | Leaflet/MapLibre both fine — MapLibre handles GeoJSON overlays and raster tiles more natively. No Next.js needed — this is a single-page tool, don't add SSR complexity you don't need. |
| Database | **None for the weekend.** Store job results as JSON files / SQLite if you want persistence | PostGIS is the "production-grade" answer for v2, not for a 48-hour build. Every extra service is a chance for the demo to break during the interview. |
| Deployment | Frontend → Vercel/Netlify (free). Backend → Modal (auto-deploys). | Both trivial, both free, both fast. |

**Rule for the whole build: if a component doesn't directly serve detection → area → honest presentation, cut it.**

---

## 2. Pipeline (exact steps)

```
Upload (GeoTIFF, or PNG/JPG + KML boundary)
   │
   ▼
Validate & read metadata (rasterio: CRS, GSD, bounds, size)
   │
   ▼
[If KML provided] parse boundary → reproject to raster CRS → clip
   │
   ▼
Resolution check: crown_diameter_px = expected_crown_m / GSD
   → if too coarse, WARN the user before running (don't silently guess)
   │
   ▼
Tile the image (1024×1024, 15% overlap) via rasterio.windows
   │
   ▼
DeepForest inference per tile → boxes + detection scores
   │
   ▼
Merge tiles: NMS across tile boundaries (IoU-based, torchvision.ops.nms)
   │
   ▼
SAM2 (prompted by each surviving box) → per-crown polygon mask
   │
   ▼
Reproject polygons to a metric CRS (UTM zone matching the image)
   │
   ▼
Compute: crown_area_m2 per tree, SUM of crowns, UNION of crowns,
         canopy_cover_% = union_area / analyzed_area
   │
   ▼
Confidence score per crown = weighted(detection_score, mask_quality, edge_flag)
   → bucket: high / medium / low
   │
   ▼
Return GeoJSON (one feature per tree) + summary stats + confidence buckets
```

Confidence formula (keep it simple, not fake precision):
```
confidence = 0.6 * detection_score + 0.25 * mask_quality_proxy + 0.15 * (0 if on_tile_edge else 1)
```
`mask_quality_proxy` = simple heuristic (mask area not implausibly tiny/huge relative to box area). Don't over-engineer this — a defensible simple formula beats an undocumented complex one.

---

## 3. Backend API (only these endpoints)

```
POST /analyze        → multipart upload (image [+ optional KML]) → returns job_id
GET  /jobs/{id}       → status: queued | processing | done | failed
GET  /jobs/{id}/result → GeoJSON + summary stats once done
GET  /jobs/{id}/export/{format}  → geojson | csv
```

That's it. No auth, no user accounts, no multi-tenant anything — a stranger doesn't need a login to try your demo.

---

## 4. Frontend (single page, four states)

1. **Upload screen** — drag-drop image (+ optional KML), one button: "Analyze"
2. **Processing screen** — progress indicator, polling `/jobs/{id}`
3. **Results screen** (the one that matters most):
   - MapLibre map: base imagery + crown polygons colored by confidence (green/yellow/red)
   - Summary card: tree count, canopy area (show BOTH sum-of-crowns and union — label clearly), coverage %
   - Confidence breakdown: "1,240 high · 150 medium · 40 low — review recommended"
   - Click a crown → popup with its area + confidence + a "flag as wrong" button (stores a correction, updates count live — no retraining needed, just recompute the displayed total)
   - **Permanent, visible "Limitations" panel** — not a footnote. State plainly: resolution floor, dense/overlapping canopy undercounting, no carbon/biomass claim made.
4. **Export bar** — GeoJSON / CSV download buttons, always visible on results screen.

Design direction: clean, green/neutral palette, big map, small stat cards — reads like an analysis tool, not a toy.

---

## 5. What to explicitly NOT build (protects your weekend)

- No user auth / accounts
- No PostGIS / Postgres — flat files are fine for a demo
- No Celery/Redis job queue — FastAPI `BackgroundTasks` is enough for weekend traffic
- No species classification, no AGB/carbon $ estimate, no LiDAR/CHM support
- No multi-date change detection unless everything above is done by Sunday noon
- No custom model training/fine-tuning — pretrained DeepForest + SAM2 only

If Saturday goes well and there's slack on Sunday, in priority order add: (1) human-correction persistence, (2) union-vs-sum area distinction in UI, (3) before/after slider — in that order, stop whenever you run low on time.

---

## 6. Day-by-day plan

**Saturday**
- AM: DeepForest install + run on 2-3 sample tree images locally, confirm output format
- Midday: Add SAM2 prompting from DeepForest boxes, confirm crown polygons look right
- PM: Tiling + NMS merge for a large raster; wrap into FastAPI `/analyze` + `/jobs`
- EOD: Deploy backend to Modal, confirm it responds from a public URL

**Sunday**
- AM: React + MapLibre upload screen + polling + map render of GeoJSON
- Midday: Confidence coloring, summary card, limitations panel, export buttons
- PM: Correction interaction (flag wrong crown → live recount), deploy frontend
- EOD: Test end-to-end with a stranger's eyes (fresh browser, no context) — fix whatever confuses them
- Write the 2-page explainer (pipeline diagram + honest limitations section — this page is what gets you shortlisted)

**Monday (buffer only)**
- Bug fixes, re-test upload edge cases (bad KML, huge file, no detections), submit early — don't submit at 11:58 PM.

---

## 7. 2-page explainer structure (for submission)

**Page 1 — How it works**
- One diagram: Upload → Tile → DeepForest → SAM2 → NMS/merge → Area calc → Confidence → Output
- What CRS/area math you use and why (metric projection, not degrees)
- Screenshot of the results UI

**Page 2 — Honesty**
- Actual precision/recall you observed on your own test images (don't cite published numbers as if they're yours — report what YOU measured)
- Named failure modes: dense/overlapping canopy, low-GSD imagery, shadow-heavy scenes
- Explicit statement of what the tool does NOT claim (no carbon/biomass number, no species ID)
- This page is the one the judges said they weight most — don't write it as an afterthought.
