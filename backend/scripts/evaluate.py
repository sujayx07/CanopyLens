"""
evaluate.py — CanopyLens Detection Accuracy Evaluation Harness
==============================================================

Measures real tree detection accuracy against hand-labeled ground-truth
bounding boxes using standard PASCAL VOC / COCO IoU evaluation protocol.

Metrics computed:
- True Positives (TP), False Positives (FP), False Negatives (FN)
- Precision: TP / (TP + FP)
- Recall: TP / (TP + FN)
- F1 Score: 2 * (Precision * Recall) / (Precision + Recall)
- Mean IoU of matched pairs (spatial tightness & crown shape fidelity)
- Density breakdown: reports accuracy broken down by "isolated", "sparse", "dense"

Outputs:
- Formatted console table
- backend/eval_data/results_summary.csv
- backend/eval_data/results_summary.md (ready to paste into write-up)
- Optional visual overlays (--save-overlays)
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.services.pipeline import run_pipeline

logger = logging.getLogger("canopylens.evaluate")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


@dataclass
class BoundingBox:
    xmin: float
    ymin: float
    xmax: float
    ymax: float
    score: float = 1.0
    label: str = "Tree"

    @property
    def area(self) -> float:
        return max(0.0, self.xmax - self.xmin) * max(0.0, self.ymax - self.ymin)

    @property
    def width(self) -> float:
        return max(0.0, self.xmax - self.xmin)

    @property
    def height(self) -> float:
        return max(0.0, self.ymax - self.ymin)


@dataclass
class ImageEvalResult:
    image_name: str
    image_path: str
    density: str
    gt_count: int
    pred_count: int
    tp: int
    fp: int
    fn: int
    precision: float
    recall: float
    f1: float
    mean_iou: float
    matched_ious: list[float] = field(default_factory=list)
    gt_boxes: list[BoundingBox] = field(default_factory=list)
    pred_boxes: list[BoundingBox] = field(default_factory=list)
    matched_gt_indices: set[int] = field(default_factory=set)
    matched_pred_indices: set[int] = field(default_factory=set)
    duration_s: float = 0.0


@dataclass
class CategoryAggregate:
    category: str
    image_count: int = 0
    total_gt: int = 0
    total_pred: int = 0
    total_tp: int = 0
    total_fp: int = 0
    total_fn: int = 0
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    mean_iou: float = 0.0
    all_ious: list[float] = field(default_factory=list)


def compute_box_iou(box1: BoundingBox, box2: BoundingBox) -> float:
    """Compute Intersection over Union (IoU) between two bounding boxes."""
    ixmin = max(box1.xmin, box2.xmin)
    iymin = max(box1.ymin, box2.ymin)
    ixmax = min(box1.xmax, box2.xmax)
    iymax = min(box1.ymax, box2.ymax)

    iw = max(0.0, ixmax - ixmin)
    ih = max(0.0, iymax - iymin)
    intersection = iw * ih

    if intersection <= 0.0:
        return 0.0

    union = box1.area + box2.area - intersection
    if union <= 0.0:
        return 0.0

    return float(intersection / union)


def load_ground_truth_boxes(csv_path: Path) -> list[BoundingBox]:
    """Parse ground truth boxes from CSV (columns: xmin, ymin, xmax, ymax)."""
    boxes: list[BoundingBox] = []
    if not csv_path.is_file():
        return boxes

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        # Detect header
        sample = f.read(1024)
        f.seek(0)
        has_header = csv.Sniffer().has_header(sample) if sample.strip() else True

        reader = csv.reader(f)
        header = None
        col_map = {"xmin": 0, "ymin": 1, "xmax": 2, "ymax": 3}

        if has_header:
            header_row = next(reader, None)
            if header_row:
                clean_header = [col.strip().lower() for col in header_row]
                for key in ["xmin", "ymin", "xmax", "ymax"]:
                    if key in clean_header:
                        col_map[key] = clean_header.index(key)
                    elif f"box_{key}" in clean_header:
                        col_map[key] = clean_header.index(f"box_{key}")
                # Check for x1, y1, x2, y2 aliases
                for standard_key, alias in [("xmin", "x1"), ("ymin", "y1"), ("xmax", "x2"), ("ymax", "y2")]:
                    if alias in clean_header:
                        col_map[standard_key] = clean_header.index(alias)

        for row_idx, row in enumerate(reader, start=1 if not has_header else 2):
            if not row or len(row) < 4:
                continue
            try:
                x1 = float(row[col_map["xmin"]].strip())
                y1 = float(row[col_map["ymin"]].strip())
                x2 = float(row[col_map["xmax"]].strip())
                y2 = float(row[col_map["ymax"]].strip())

                xmin = min(x1, x2)
                ymin = min(y1, y2)
                xmax = max(x1, x2)
                ymax = max(y1, y2)

                if xmax > xmin and ymax > ymin:
                    boxes.append(BoundingBox(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax))
            except (ValueError, IndexError) as err:
                logger.warning("Failed to parse row %d in %s: %s", row_idx, csv_path.name, err)

    return boxes


def extract_prediction_boxes(pipeline_result: Any) -> list[BoundingBox]:
    """Extract predicted bounding boxes from pipeline CrownPolygon list."""
    from shapely import wkt as shapely_wkt

    pred_boxes: list[BoundingBox] = []
    crowns = getattr(pipeline_result, "crowns", [])

    for crown in crowns:
        geom_wkt = getattr(crown, "geometry_wkt", None)
        det = getattr(crown, "detection", None)
        score = float(getattr(crown, "confidence", 1.0))

        if geom_wkt:
            try:
                poly = shapely_wkt.loads(geom_wkt)
                minx, miny, maxx, maxy = poly.bounds
                pred_boxes.append(
                    BoundingBox(
                        xmin=float(minx),
                        ymin=float(miny),
                        xmax=float(maxx),
                        ymax=float(maxy),
                        score=score,
                    )
                )
                continue
            except Exception:
                pass

        if det:
            pred_boxes.append(
                BoundingBox(
                    xmin=float(det.xmin),
                    ymin=float(det.ymin),
                    xmax=float(det.xmax),
                    ymax=float(det.ymax),
                    score=score,
                )
            )

    return pred_boxes


def match_boxes(
    pred_boxes: list[BoundingBox],
    gt_boxes: list[BoundingBox],
    iou_threshold: float = 0.50,
) -> tuple[int, int, int, list[float], set[int], set[int]]:
    """Match predictions to ground truth using greedy bipartite matching by IoU.

    Returns:
        tp, fp, fn, matched_ious, matched_gt_indices, matched_pred_indices
    """
    if not gt_boxes and not pred_boxes:
        return 0, 0, 0, [], set(), set()
    if not gt_boxes:
        return 0, len(pred_boxes), 0, [], set(), set()
    if not pred_boxes:
        return 0, 0, len(gt_boxes), [], set(), set()

    # Pre-calculate candidate pairs with IoU >= iou_threshold
    candidates: list[tuple[float, float, int, int]] = []
    for p_idx, p_box in enumerate(pred_boxes):
        for g_idx, g_box in enumerate(gt_boxes):
            iou = compute_box_iou(p_box, g_box)
            if iou >= iou_threshold:
                # Rank by (prediction_score, iou)
                candidates.append((p_box.score, iou, p_idx, g_idx))

    # Sort candidates by prediction score descending, then by IoU descending
    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)

    matched_preds: set[int] = set()
    matched_gts: set[int] = set()
    matched_ious: list[float] = []

    for _, iou, p_idx, g_idx in candidates:
        if p_idx not in matched_preds and g_idx not in matched_gts:
            matched_preds.add(p_idx)
            matched_gts.add(g_idx)
            matched_ious.append(iou)

    tp = len(matched_ious)
    fp = len(pred_boxes) - tp
    fn = len(gt_boxes) - tp

    return tp, fp, fn, matched_ious, matched_gts, matched_preds


def resolve_density_tag(
    image_path: Path,
    metadata_map: dict[str, str],
    gt_count: int,
) -> str:
    """Resolve density tag from metadata, filename keywords, or tree count fallback."""
    # 1. Metadata file mapping
    name = image_path.name
    stem = image_path.stem
    if name in metadata_map:
        return metadata_map[name].strip().lower()
    if stem in metadata_map:
        return metadata_map[stem].strip().lower()

    # 2. Filename keyword inspection
    lower_name = name.lower()
    if "isolated" in lower_name:
        return "isolated"
    if "sparse" in lower_name:
        return "sparse"
    if "dense" in lower_name:
        return "dense"

    # 3. Ground truth density heuristic fallback
    if gt_count <= 2:
        return "isolated"
    elif gt_count <= 20:
        return "sparse"
    else:
        return "dense"


def load_metadata_map(eval_dir: Path) -> dict[str, str]:
    """Load metadata mapping from metadata.csv or metadata.json if present."""
    metadata_map: dict[str, str] = {}

    csv_path = eval_dir / "metadata.csv"
    if csv_path.is_file():
        try:
            with open(csv_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    fn = row.get("filename") or row.get("image") or row.get("name")
                    density = row.get("density") or row.get("tag") or row.get("category")
                    if fn and density:
                        metadata_map[fn.strip()] = density.strip()
        except Exception as err:
            logger.warning("Could not parse %s: %s", csv_path.name, err)

    json_path = eval_dir / "metadata.json"
    if json_path.is_file():
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    for k, v in data.items():
                        if isinstance(v, str):
                            metadata_map[k] = v
                        elif isinstance(v, dict) and "density" in v:
                            metadata_map[k] = str(v["density"])
        except Exception as err:
            logger.warning("Could not parse %s: %s", json_path.name, err)

    return metadata_map


def find_label_file(eval_dir: Path, image_path: Path) -> Optional[Path]:
    """Find corresponding ground-truth CSV file for an image."""
    stem = image_path.stem
    candidates = [
        eval_dir / f"{stem}_labels.csv",
        eval_dir / f"{stem}.csv",
        eval_dir / f"labels_{stem}.csv",
        eval_dir / f"{stem}_gt.csv",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def calculate_metrics(tp: int, fp: int, fn: int, matched_ious: list[float]) -> tuple[float, float, float, float]:
    """Compute precision, recall, f1, and mean_iou."""
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2.0 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    mean_iou = float(sum(matched_ious) / len(matched_ious)) if matched_ious else 0.0
    return precision, recall, f1, mean_iou


def render_ascii_table(rows: list[list[str]], headers: list[str]) -> str:
    """Generate a clean aligned ASCII table string."""
    col_widths = [len(h) for h in headers]
    for r in rows:
        for i, val in enumerate(r):
            col_widths[i] = max(col_widths[i], len(str(val)))

    sep_border = "+-" + "-+-".join("-" * w for w in col_widths) + "-+"
    header_line = "| " + " | ".join(f"{h:<{col_widths[i]}}" for i, h in enumerate(headers)) + " |"

    lines = [sep_border, header_line, sep_border]
    for r in rows:
        line = "| " + " | ".join(f"{str(val):<{col_widths[i]}}" for i, val in enumerate(r)) + " |"
        lines.append(line)
    lines.append(sep_border)
    return "\n".join(lines)


def save_visual_overlay(
    image_path: Path,
    output_path: Path,
    gt_boxes: list[BoundingBox],
    pred_boxes: list[BoundingBox],
    matched_gt: set[int],
    matched_pred: set[int],
) -> None:
    """Generate visual overlay showing GT boxes (Blue) and Predicted crowns (Green/Red)."""
    try:
        import cv2
        import numpy as np

        img = cv2.imread(str(image_path))
        if img is None:
            return

        # 1. Draw Ground Truth boxes (Blue = Matched, Cyan/Yellow = Missed FN)
        for idx, gt in enumerate(gt_boxes):
            x1, y1, x2, y2 = int(gt.xmin), int(gt.ymin), int(gt.xmax), int(gt.ymax)
            if idx in matched_gt:
                color = (255, 140, 0)  # Blue/Orange for GT
                cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
            else:
                color = (0, 165, 255)  # Orange for False Negative (unmatched GT)
                cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                cv2.putText(img, "FN", (x1 + 3, y1 + 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

        # 2. Draw Predicted boxes (Green = TP Match, Red = FP False Alarm)
        for idx, pb in enumerate(pred_boxes):
            x1, y1, x2, y2 = int(pb.xmin), int(pb.ymin), int(pb.xmax), int(pb.ymax)
            if idx in matched_pred:
                color = (0, 255, 0)  # Green for True Positive
                cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                cv2.putText(
                    img, f"TP {pb.score:.2f}", (x1 + 3, y2 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.40, color, 1
                )
            else:
                color = (0, 0, 255)  # Red for False Positive
                cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                cv2.putText(
                    img, f"FP {pb.score:.2f}", (x1 + 3, y2 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.40, color, 1
                )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(output_path), img)
    except Exception as err:
        logger.warning("Could not generate overlay for %s: %s", image_path.name, err)


def fetch_api_predictions(api_url: str, image_path: Path) -> list[BoundingBox]:
    """Submit image to deployed CanopyLens API (e.g. Modal GPU) and retrieve predicted boxes."""
    import httpx

    api_url = api_url.rstrip("/")
    with open(image_path, "rb") as f:
        img_bytes = f.read()

    with httpx.Client(timeout=120.0) as client:
        # 1. POST /analyze
        mime_type = "image/tiff" if image_path.suffix.lower() in (".tif", ".tiff") else "image/jpeg"
        files = {"image": (image_path.name, img_bytes, mime_type)}
        resp = client.post(f"{api_url}/analyze", files=files)
        if resp.status_code not in (200, 202):
            raise RuntimeError(f"API /analyze returned status {resp.status_code}: {resp.text}")
        job_id = resp.json().get("job_id")
        if not job_id:
            raise RuntimeError(f"No job_id returned by API: {resp.text}")

        # 2. Poll /jobs/{job_id}
        for _ in range(60):
            time.sleep(2.0)
            status_resp = client.get(f"{api_url}/jobs/{job_id}")
            if status_resp.status_code == 200:
                s_data = status_resp.json()
                status = s_data.get("status")
                if status == "done":
                    break
                elif status in ("failed", "error"):
                    raise RuntimeError(f"Job {job_id} failed on remote API: {s_data.get('error')}")

        # 3. GET /jobs/{job_id}/result
        res_resp = client.get(f"{api_url}/jobs/{job_id}/result")
        if res_resp.status_code != 200:
            raise RuntimeError(f"Could not fetch result for job {job_id}: {res_resp.text}")

        res_json = res_resp.json()
        boxes: list[BoundingBox] = []
        for feat in res_json.get("features", []):
            geom = feat.get("geometry", {})
            props = feat.get("properties", {})
            score = float(props.get("confidence", 1.0))
            gtype = geom.get("type")
            coords = geom.get("coordinates", [])
            if not coords:
                continue
            poly = coords[0] if gtype == "Polygon" else (coords[0][0] if gtype == "MultiPolygon" else [])
            if poly:
                xs = [pt[0] for pt in poly]
                ys = [pt[1] for pt in poly]
                if xs and ys:
                    boxes.append(BoundingBox(xmin=min(xs), ymin=min(ys), xmax=max(xs), ymax=max(ys), score=score))
        return boxes


def run_evaluation(
    eval_dir: Path,
    iou_threshold: float = 0.50,
    api_url: Optional[str] = None,
    output_csv: Optional[Path] = None,
    output_md: Optional[Path] = None,
    save_overlays: bool = False,
    debug: bool = False,
) -> tuple[list[ImageEvalResult], list[CategoryAggregate], CategoryAggregate]:
    """Execute complete evaluation across all annotated images in eval_dir."""
    if not eval_dir.is_dir():
        raise FileNotFoundError(f"Evaluation directory not found: {eval_dir}")

    metadata_map = load_metadata_map(eval_dir)

    # Collect images with corresponding label CSVs
    image_files = sorted(
        [p for p in eval_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
    )

    if not image_files:
        raise ValueError(f"No image files ({', '.join(IMAGE_EXTENSIONS)}) found in {eval_dir}")

    eval_pairs: list[tuple[Path, Path]] = []
    missing_labels: list[str] = []

    for img in image_files:
        label_file = find_label_file(eval_dir, img)
        if label_file:
            eval_pairs.append((img, label_file))
        else:
            missing_labels.append(img.name)

    if not eval_pairs:
        raise ValueError(
            f"Found {len(image_files)} image(s) in {eval_dir}, but NONE have a corresponding "
            f"`<image_name>_labels.csv` file. Please create ground-truth CSVs or use `scripts/label_tool.py`."
        )

    print(f"\nCanopyLens Evaluation Harness")
    print(f"=============================")
    print(f"Eval Directory:  {eval_dir}")
    print(f"IoU Threshold:   {iou_threshold:.2f} (PASCAL VOC standard)")
    print(f"Annotated Pairs: {len(eval_pairs)} image(s)")
    if missing_labels:
        print(f"Skipped (no GT): {len(missing_labels)} file(s) ({', '.join(missing_labels[:3])}...)")
    print("-" * 60)

    results: list[ImageEvalResult] = []

    for idx, (img_path, label_path) in enumerate(eval_pairs, start=1):
        print(f"[{idx}/{len(eval_pairs)}] Processing {img_path.name} ... ", end="", flush=True)
        gt_boxes = load_ground_truth_boxes(label_path)
        density = resolve_density_tag(img_path, metadata_map, len(gt_boxes))

        if api_url:
            start_time = time.perf_counter()
            pred_boxes = fetch_api_predictions(api_url, img_path)
            duration = time.perf_counter() - start_time
        else:
            start_time = time.perf_counter()
            pipeline_res = run_pipeline(str(img_path), debug=debug)
            duration = time.perf_counter() - start_time
            pred_boxes = extract_prediction_boxes(pipeline_res)

        tp, fp, fn, matched_ious, matched_gts, matched_preds = match_boxes(
            pred_boxes, gt_boxes, iou_threshold=iou_threshold
        )
        precision, recall, f1, mean_iou = calculate_metrics(tp, fp, fn, matched_ious)

        print(
            f"Done in {duration:.1f}s | GT: {len(gt_boxes)}, Pred: {len(pred_boxes)} | "
            f"TP={tp} FP={fp} FN={fn} | F1={f1:.3f} mIoU={mean_iou:.3f}"
        )

        res = ImageEvalResult(
            image_name=img_path.name,
            image_path=str(img_path),
            density=density,
            gt_count=len(gt_boxes),
            pred_count=len(pred_boxes),
            tp=tp,
            fp=fp,
            fn=fn,
            precision=precision,
            recall=recall,
            f1=f1,
            mean_iou=mean_iou,
            matched_ious=matched_ious,
            gt_boxes=gt_boxes,
            pred_boxes=pred_boxes,
            matched_gt_indices=matched_gts,
            matched_pred_indices=matched_preds,
            duration_s=duration,
        )
        results.append(res)

        if save_overlays:
            overlay_dir = eval_dir / "eval_visuals"
            overlay_file = overlay_dir / f"{img_path.stem}_eval.jpg"
            save_visual_overlay(
                img_path, overlay_file, gt_boxes, pred_boxes, matched_gts, matched_preds
            )

    # ---------------------------------------------------------------------------
    # Aggregate Breakdown by Density Category
    # ---------------------------------------------------------------------------
    categories_present = sorted(list({r.density for r in results}))
    density_aggregates: list[CategoryAggregate] = []

    for cat in categories_present:
        cat_items = [r for r in results if r.density == cat]
        total_tp = sum(r.tp for r in cat_items)
        total_fp = sum(r.fp for r in cat_items)
        total_fn = sum(r.fn for r in cat_items)
        cat_ious = [iou for r in cat_items for iou in r.matched_ious]
        prec, rec, f1, mean_iou = calculate_metrics(total_tp, total_fp, total_fn, cat_ious)

        density_aggregates.append(
            CategoryAggregate(
                category=cat.capitalize(),
                image_count=len(cat_items),
                total_gt=sum(r.gt_count for r in cat_items),
                total_pred=sum(r.pred_count for r in cat_items),
                total_tp=total_tp,
                total_fp=total_fp,
                total_fn=total_fn,
                precision=prec,
                recall=rec,
                f1=f1,
                mean_iou=mean_iou,
                all_ious=cat_ious,
            )
        )

    # ---------------------------------------------------------------------------
    # Global / Overall Aggregate
    # ---------------------------------------------------------------------------
    all_tp = sum(r.tp for r in results)
    all_fp = sum(r.fp for r in results)
    all_fn = sum(r.fn for r in results)
    all_ious = [iou for r in results for iou in r.matched_ious]
    overall_prec, overall_rec, overall_f1, overall_mean_iou = calculate_metrics(
        all_tp, all_fp, all_fn, all_ious
    )

    overall_aggregate = CategoryAggregate(
        category="Overall",
        image_count=len(results),
        total_gt=sum(r.gt_count for r in results),
        total_pred=sum(r.pred_count for r in results),
        total_tp=all_tp,
        total_fp=all_fp,
        total_fn=all_fn,
        precision=overall_prec,
        recall=overall_rec,
        f1=overall_f1,
        mean_iou=overall_mean_iou,
        all_ious=all_ious,
    )

    return results, density_aggregates, overall_aggregate


def print_console_reports(
    results: list[ImageEvalResult],
    density_aggregates: list[CategoryAggregate],
    overall: CategoryAggregate,
) -> None:
    """Print beautifully formatted evaluation tables to the console."""
    print("\n" + "=" * 80)
    print("CANOPYLENS EVALUATION RESULTS — DETAILED IMAGE BREAKDOWN")
    print("=" * 80)

    headers = [
        "Image Name",
        "Density",
        "GT",
        "Pred",
        "TP",
        "FP",
        "FN",
        "Precision",
        "Recall",
        "F1 Score",
        "Mean IoU",
    ]
    rows = []
    for r in results:
        rows.append(
            [
                r.image_name,
                r.density.capitalize(),
                str(r.gt_count),
                str(r.pred_count),
                str(r.tp),
                str(r.fp),
                str(r.fn),
                f"{r.precision * 100:.1f}%",
                f"{r.recall * 100:.1f}%",
                f"{r.f1:.3f}",
                f"{r.mean_iou:.3f}",
            ]
        )

    print(render_ascii_table(rows, headers))

    print("\n" + "=" * 80)
    print("ACCURACY BREAKDOWN BY CANOPY DENSITY")
    print("=" * 80)

    summary_headers = [
        "Density Category",
        "Images",
        "GT Trees",
        "Pred Trees",
        "TP",
        "FP",
        "FN",
        "Precision",
        "Recall",
        "F1 Score",
        "Mean IoU",
    ]
    summary_rows = []
    for cat in density_aggregates:
        summary_rows.append(
            [
                cat.category,
                str(cat.image_count),
                str(cat.total_gt),
                str(cat.total_pred),
                str(cat.total_tp),
                str(cat.total_fp),
                str(cat.total_fn),
                f"{cat.precision * 100:.1f}%",
                f"{cat.recall * 100:.1f}%",
                f"{cat.f1:.3f}",
                f"{cat.mean_iou:.3f}",
            ]
        )

    # Append overall row
    summary_rows.append(
        [
            overall.category.upper(),
            str(overall.image_count),
            str(overall.total_gt),
            str(overall.total_pred),
            str(overall.total_tp),
            str(overall.total_fp),
            str(overall.total_fn),
            f"{overall.precision * 100:.1f}%",
            f"{overall.recall * 100:.1f}%",
            f"{overall.f1:.3f}",
            f"{overall.mean_iou:.3f}",
        ]
    )

    print(render_ascii_table(summary_rows, summary_headers))
    print("=" * 80 + "\n")


def export_results_csv(
    csv_path: Path,
    results: list[ImageEvalResult],
    density_aggregates: list[CategoryAggregate],
    overall: CategoryAggregate,
) -> None:
    """Save structured evaluation metrics to CSV."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "record_type",
                "name_or_category",
                "density",
                "gt_count",
                "pred_count",
                "tp",
                "fp",
                "fn",
                "precision",
                "recall",
                "f1_score",
                "mean_iou",
                "duration_seconds",
            ]
        )

        # Per-image rows
        for r in results:
            writer.writerow(
                [
                    "image",
                    r.image_name,
                    r.density,
                    r.gt_count,
                    r.pred_count,
                    r.tp,
                    r.fp,
                    r.fn,
                    round(r.precision, 4),
                    round(r.recall, 4),
                    round(r.f1, 4),
                    round(r.mean_iou, 4),
                    round(r.duration_s, 2),
                ]
            )

        # Density aggregate rows
        for d in density_aggregates:
            writer.writerow(
                [
                    "density_group",
                    d.category,
                    d.category.lower(),
                    d.total_gt,
                    d.total_pred,
                    d.total_tp,
                    d.total_fp,
                    d.total_fn,
                    round(d.precision, 4),
                    round(d.recall, 4),
                    round(d.f1, 4),
                    round(d.mean_iou, 4),
                    "",
                ]
            )

        # Overall row
        writer.writerow(
            [
                "overall",
                "Overall",
                "all",
                overall.total_gt,
                overall.total_pred,
                overall.total_tp,
                overall.total_fp,
                overall.total_fn,
                round(overall.precision, 4),
                round(overall.recall, 4),
                round(overall.f1, 4),
                round(overall.mean_iou, 4),
                "",
            ]
        )

    print(f"[Export] Saved results CSV to: {csv_path}")


def export_results_markdown(
    md_path: Path,
    results: list[ImageEvalResult],
    density_aggregates: list[CategoryAggregate],
    overall: CategoryAggregate,
    iou_threshold: float,
) -> None:
    """Save markdown report snippet formatted for the 2-page brief."""
    md_path.parent.mkdir(parents=True, exist_ok=True)

    content = f"""# Empirical Detection Accuracy Evaluation

**Evaluation Protocol**: Predictions matched against hand-labeled ground-truth tree crowns using greedy bipartite IoU assignment with threshold **IoU $\\ge {iou_threshold:.2f}$** (standard benchmark for aerial object detection).

---

## 1. Executive Summary Performance

| Metric | Overall Benchmark | Description |
| :--- | :--- | :--- |
| **Precision** | **{overall.precision * 100:.1f}%** | Proportion of model detections that are genuine tree crowns |
| **Recall** | **{overall.recall * 100:.1f}%** | Proportion of ground-truth trees successfully detected |
| **F1 Score** | **{overall.f1:.3f}** | Harmonic mean of detection precision and recall |
| **Mean IoU (TP)** | **{overall.mean_iou:.3f}** | Average spatial overlap and organic crown boundary alignment |
| **Evaluation Set** | **{overall.image_count} images** ({overall.total_gt} GT trees, {overall.total_pred} predicted crowns) | Tested across varied canopy densities |

---

## 2. Accuracy Breakdown by Canopy Density

Breaking down accuracy by canopy density reveals where the model excels and where structural overlap occurs:

| Canopy Density | Images | Ground Truth | Predictions | TP | FP | FN | Precision | Recall | F1 Score | Mean IoU |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
"""

    for cat in density_aggregates:
        content += (
            f"| **{cat.category}** | {cat.image_count} | {cat.total_gt} | {cat.total_pred} | "
            f"{cat.total_tp} | {cat.total_fp} | {cat.total_fn} | "
            f"{cat.precision * 100:.1f}% | {cat.recall * 100:.1f}% | **{cat.f1:.3f}** | {cat.mean_iou:.3f} |\n"
        )

    content += (
        f"| **OVERALL** | **{overall.image_count}** | **{overall.total_gt}** | **{overall.total_pred}** | "
        f"**{overall.total_tp}** | **{overall.total_fp}** | **{overall.total_fn}** | "
        f"**{overall.precision * 100:.1f}%** | **{overall.recall * 100:.1f}%** | **{overall.f1:.3f}** | **{overall.mean_iou:.3f}** |\n"
    )

    content += """
---

## 3. Per-Image Detailed Evaluation

| Image Filename | Density | GT Trees | Predictions | TP | FP | FN | Precision | Recall | F1 | Mean IoU |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
"""

    for r in results:
        content += (
            f"| `{r.image_name}` | {r.density.capitalize()} | {r.gt_count} | {r.pred_count} | "
            f"{r.tp} | {r.fp} | {r.fn} | {r.precision * 100:.1f}% | {r.recall * 100:.1f}% | {r.f1:.3f} | {r.mean_iou:.3f} |\n"
        )

    content += f"""
---

## 4. Methodology & Rigor Notes

1. **Matching Rule**: A predicted crown is certified as a True Positive if and only if its bounding box achieves $\\text{{IoU}} \\ge {iou_threshold:.2f}$ against an unmatched ground-truth crown.
2. **Shape Fidelity (Mean IoU)**: The mean IoU of matched pairs ({overall.mean_iou:.3f}) measures polygon tightness beyond simple binary presence.
3. **Density Characteristics**:
   - **Isolated Trees**: Tests resistance to over-fragmentation on single crowns.
   - **Sparse Orchards/Meadows**: Tests small crown sensitivity and flowering tree detection.
   - **Dense Canopies**: Tests cross-crown boundary delineation and union dissolve accuracy.
"""

    with open(md_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

    print(f"[Export] Saved markdown summary to: {md_path}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="CanopyLens Real Ground-Truth Detection Accuracy Evaluation Harness"
    )
    parser.add_argument(
        "--eval-dir",
        default=str(BACKEND_DIR / "eval_data"),
        help="Path to folder containing test images and *_labels.csv files (default: backend/eval_data)",
    )
    parser.add_argument(
        "--iou-thresh",
        type=float,
        default=0.50,
        help="IoU match threshold (default: 0.50)",
    )
    parser.add_argument(
        "--output-csv",
        default=None,
        help="Output CSV path (default: <eval_dir>/results_summary.csv)",
    )
    parser.add_argument(
        "--output-md",
        default=None,
        help="Output Markdown path (default: <eval_dir>/results_summary.md)",
    )
    parser.add_argument(
        "--api-url",
        default=None,
        help="Optional URL of deployed CanopyLens FastAPI backend (e.g. Modal GPU) to evaluate remote inference against ground truth.",
    )
    parser.add_argument(
        "--save-overlays",
        action="store_true",
        help="Save visual overlay images showing GT (blue) and Predictions (green/red)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging in pipeline execution",
    )

    args = parser.parse_args()
    eval_dir = Path(args.eval_dir).resolve()
    out_csv = Path(args.output_csv).resolve() if args.output_csv else eval_dir / "results_summary.csv"
    out_md = Path(args.output_md).resolve() if args.output_md else eval_dir / "results_summary.md"

    try:
        results, density_aggs, overall = run_evaluation(
            eval_dir=eval_dir,
            iou_threshold=args.iou_thresh,
            api_url=args.api_url,
            output_csv=out_csv,
            output_md=out_md,
            save_overlays=args.save_overlays,
            debug=args.debug,
        )
        print_console_reports(results, density_aggs, overall)
        export_results_csv(out_csv, results, density_aggs, overall)
        export_results_markdown(out_md, results, density_aggs, overall, args.iou_thresh)
        return 0
    except Exception as exc:
        print(f"\n[Evaluation Error] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
