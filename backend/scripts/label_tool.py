"""
label_tool.py — CanopyLens Lightweight Tree Crown Labeling Tool
===============================================================

A fast, zero-dependency OpenCV tool to hand-label ground-truth tree crowns
by simply clicking and dragging bounding boxes on aerial images.

Usage:
    python scripts/label_tool.py [path/to/image.jpg]

Controls:
    Left Click + Drag  : Draw a bounding box around a tree crown
    u or z             : Undo last bounding box
    c                  : Clear all boxes
    p                  : Pre-fill boxes automatically using model predictions!
    s                  : Save boxes to <image>_labels.csv
    q or Esc           : Save and Exit
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
import sys

import cv2
import numpy as np

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


class TreeLabeler:
    def __init__(self, image_path: Path, output_csv: Path):
        self.image_path = image_path
        self.output_csv = output_csv
        self.window_name = f"CanopyLens Label Tool — {image_path.name}"

        # Load image
        self.orig_img = cv2.imread(str(image_path))
        if self.orig_img is None:
            raise ValueError(f"Unable to read image: {image_path}")

        self.img_h, self.img_w = self.orig_img.shape[:2]

        # Display scaling to comfortably fit screens (e.g. max 1280x800)
        max_disp_w, max_disp_h = 1360, 820
        scale_w = max_disp_w / self.img_w
        scale_h = max_disp_h / self.img_h
        self.scale = min(1.0, scale_w, scale_h)
        self.disp_w = int(self.img_w * self.scale)
        self.disp_h = int(self.img_h * self.scale)

        # Boxes stored in original pixel coordinates: [xmin, ymin, xmax, ymax]
        self.boxes: list[list[float]] = []

        # Mouse state
        self.drawing = False
        self.start_pt = (0, 0)
        self.curr_pt = (0, 0)

        # Load existing labels if present
        self.load_existing_labels()

    def load_existing_labels(self) -> None:
        if self.output_csv.is_file():
            try:
                with open(self.output_csv, "r", encoding="utf-8-sig") as f:
                    reader = csv.reader(f)
                    header = next(reader, None)
                    for row in reader:
                        if len(row) >= 4:
                            x1, y1, x2, y2 = map(float, row[:4])
                            self.boxes.append([min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)])
                print(f"Loaded {len(self.boxes)} existing boxes from {self.output_csv.name}")
            except Exception as err:
                print(f"Notice: Could not load existing CSV: {err}")

    def save_labels(self) -> None:
        self.output_csv.parent.mkdir(parents=True, exist_ok=True)
        with open(self.output_csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["xmin", "ymin", "xmax", "ymax"])
            for box in self.boxes:
                writer.writerow([f"{b:.1f}" for b in box])
        print(f"Saved {len(self.boxes)} tree boxes to {self.output_csv.resolve()}")

    def prefill_with_model(self) -> None:
        print("Running CanopyLens pipeline to pre-fill tree boxes...")
        try:
            from app.services.pipeline import run_pipeline
            from shapely import wkt as shapely_wkt

            res = run_pipeline(str(self.image_path))
            count = 0
            for crown in res.crowns:
                if crown.geometry_wkt:
                    poly = shapely_wkt.loads(crown.geometry_wkt)
                    minx, miny, maxx, maxy = poly.bounds
                    self.boxes.append([float(minx), float(miny), float(maxx), float(maxy)])
                    count += 1
                elif crown.detection:
                    d = crown.detection
                    self.boxes.append([float(d.xmin), float(d.ymin), float(d.xmax), float(d.ymax)])
                    count += 1
            print(f"Pre-filled {count} predicted boxes! Adjust or draw additional crowns as needed.")
        except Exception as exc:
            print(f"Pre-fill failed: {exc}")

    def mouse_callback(self, event, x, y, flags, param) -> None:
        orig_x = float(x) / self.scale
        orig_y = float(y) / self.scale
        orig_x = min(max(0.0, orig_x), float(self.img_w))
        orig_y = min(max(0.0, orig_y), float(self.img_h))

        if event == cv2.EVENT_LBUTTONDOWN:
            self.drawing = True
            self.start_pt = (orig_x, orig_y)
            self.curr_pt = (orig_x, orig_y)

        elif event == cv2.EVENT_MOUSEMOVE:
            if self.drawing:
                self.curr_pt = (orig_x, orig_y)

        elif event == cv2.EVENT_LBUTTONUP:
            if self.drawing:
                self.drawing = False
                x1, y1 = self.start_pt
                x2, y2 = orig_x, orig_y
                xmin, xmax = min(x1, x2), max(x1, x2)
                ymin, ymax = min(y1, y2), max(y1, y2)
                # Ignore tiny accidental clicks
                if (xmax - xmin) > 4 and (ymax - ymin) > 4:
                    self.boxes.append([xmin, ymin, xmax, ymax])
                    print(f"Added Tree #{len(self.boxes)}: [{xmin:.1f}, {ymin:.1f}, {xmax:.1f}, {ymax:.1f}]")

    def run(self) -> None:
        cv2.namedWindow(self.window_name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(self.window_name, self.disp_w, self.disp_h)
        cv2.setMouseCallback(self.window_name, self.mouse_callback)

        print("\n" + "=" * 65)
        print("CanopyLens Fast Tree Labeler")
        print("=" * 65)
        print("Click and drag around each tree crown in the window.")
        print("Controls:")
        print("  [u] or [z] : Undo last box")
        print("  [c]        : Clear all boxes")
        print("  [p]        : Pre-fill with AI model detections")
        print("  [s]        : Save boxes to CSV")
        print("  [q] / [Esc]: Save and quit")
        print("=" * 65 + "\n")

        while True:
            # Render display image
            canvas = cv2.resize(self.orig_img, (self.disp_w, self.disp_h))

            # Draw saved boxes
            for idx, box in enumerate(self.boxes, start=1):
                dx1 = int(box[0] * self.scale)
                dy1 = int(box[1] * self.scale)
                dx2 = int(box[2] * self.scale)
                dy2 = int(box[3] * self.scale)
                cv2.rectangle(canvas, (dx1, dy1), (dx2, dy2), (0, 255, 0), 2)
                cv2.putText(
                    canvas, str(idx), (dx1 + 2, dy1 + 14),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA
                )

            # Draw currently dragging box
            if self.drawing:
                dx1 = int(self.start_pt[0] * self.scale)
                dy1 = int(self.start_pt[1] * self.scale)
                dx2 = int(self.curr_pt[0] * self.scale)
                dy2 = int(self.curr_pt[1] * self.scale)
                cv2.rectangle(canvas, (dx1, dy1), (dx2, dy2), (0, 200, 255), 2)

            # Status bar overlay
            status_text = f"Trees: {len(self.boxes)} | [u]:Undo [s]:Save [p]:Pre-fill [q]:Quit"
            cv2.rectangle(canvas, (0, 0), (self.disp_w, 26), (20, 20, 20), -1)
            cv2.putText(
                canvas, status_text, (10, 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (240, 240, 240), 1, cv2.LINE_AA
            )

            cv2.imshow(self.window_name, canvas)
            key = cv2.waitKey(20) & 0xFF

            if key in (ord("q"), 27):  # 'q' or Esc
                self.save_labels()
                break
            elif key in (ord("u"), ord("z")):  # Undo
                if self.boxes:
                    removed = self.boxes.pop()
                    print(f"Removed Tree #{len(self.boxes)+1}: {removed}")
            elif key == ord("c"):  # Clear
                self.boxes.clear()
                print("Cleared all boxes.")
            elif key == ord("s"):  # Save
                self.save_labels()
            elif key == ord("p"):  # Pre-fill
                self.prefill_with_model()

        cv2.destroyAllWindows()


def main() -> int:
    parser = argparse.ArgumentParser(description="CanopyLens Fast Tree Labeler")
    parser.add_argument("image", nargs="?", help="Path to aerial image to label")
    parser.add_argument("--output", help="Custom output CSV path (default: <image>_labels.csv)")
    parser.add_argument(
        "--prefill", action="store_true", help="Auto-populate with model predictions on open"
    )
    args = parser.parse_args()

    eval_dir = BACKEND_DIR / "eval_data"
    image_path_str = args.image

    if not image_path_str:
        # Prompt from eval_data if present
        if eval_dir.is_dir():
            images = [p for p in eval_dir.iterdir() if p.suffix.lower() in {".jpg", ".png", ".tif", ".jpeg"}]
            if images:
                print("No image path provided. Found images in backend/eval_data/:")
                for i, img in enumerate(images, 1):
                    has_gt = (eval_dir / f"{img.stem}_labels.csv").is_file()
                    status = "[labeled]" if has_gt else "[unlabeled]"
                    print(f"  [{i}] {img.name} {status}")
                choice = input("\nEnter number to open (or path to another image): ").strip()
                if choice.isdigit() and 1 <= int(choice) <= len(images):
                    image_path_str = str(images[int(choice) - 1])
                else:
                    image_path_str = choice

    if not image_path_str or not Path(image_path_str).is_file():
        print(f"Error: Image not found: {image_path_str}", file=sys.stderr)
        return 1

    img_path = Path(image_path_str).resolve()
    out_csv = (
        Path(args.output).resolve()
        if args.output
        else img_path.parent / f"{img_path.stem}_labels.csv"
    )

    labeler = TreeLabeler(img_path, out_csv)
    if args.prefill:
        labeler.prefill_with_model()
    labeler.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
