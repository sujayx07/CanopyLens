"""
finetune.py — CanopyLens DeepForest Model Fine-Tuning Harness
============================================================

Fine-tunes the pretrained DeepForest model on hand-labeled ground-truth
imagery in backend/eval_data/ to optimize tree crown detection accuracy
on target imagery (e.g. drone meadow / orchard imagery).

Key Principles:
1. Starts from DeepForest pre-trained release weights (never trains from scratch).
2. Converts eval_data annotations into DeepForest format (image_path,xmin,ymin,xmax,ymax,label).
3. Holds out at least 1-2 validation images (strict separation of train vs val).
4. Uses low learning rate (default: 1e-5) for 5-10 epochs via PyTorch Lightning trainer.
5. Saves fine-tuned checkpoint to backend/models/deepforest_finetuned.pt.
6. Can run locally (if CUDA/DeepForest installed) or remotely on Modal GPU (T4).
"""

from __future__ import annotations

import argparse
import csv
import logging
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Optional

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("canopylens.finetune")

BACKEND_DIR = Path(__file__).resolve().parent.parent
EVAL_DATA_DIR = BACKEND_DIR / "eval_data"
MODELS_DIR = BACKEND_DIR / "models"
DEFAULT_OUTPUT_MODEL = MODELS_DIR / "deepforest_finetuned.pt"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


def find_label_pairs(eval_dir: Path) -> list[tuple[Path, Path]]:
    """Find all images that have a matching ground-truth *_labels.csv file."""
    pairs: list[tuple[Path, Path]] = []
    candidates = sorted([p for p in eval_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS])

    for img_path in candidates:
        stem = img_path.stem
        label_candidates = [
            eval_dir / f"{stem}_labels.csv",
            eval_dir / f"{stem}.csv",
            eval_dir / f"labels_{stem}.csv",
            eval_dir / f"{stem}_gt.csv",
        ]
        for lc in label_candidates:
            if lc.is_file():
                pairs.append((img_path, lc))
                break

    return pairs


def load_boxes_from_csv(csv_path: Path) -> list[tuple[float, float, float, float]]:
    """Parse bounding boxes (xmin, ymin, xmax, ymax) from label CSV."""
    boxes: list[tuple[float, float, float, float]] = []
    if not csv_path.is_file():
        return boxes

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        sample = f.read(1024)
        f.seek(0)
        has_header = csv.Sniffer().has_header(sample) if sample.strip() else True
        reader = csv.reader(f)

        col_map = {"xmin": 0, "ymin": 1, "xmax": 2, "ymax": 3}
        if has_header:
            header_row = next(reader, None)
            if header_row:
                clean_header = [c.strip().lower() for c in header_row]
                for k in ["xmin", "ymin", "xmax", "ymax"]:
                    if k in clean_header:
                        col_map[k] = clean_header.index(k)
                    elif f"box_{k}" in clean_header:
                        col_map[k] = clean_header.index(f"box_{k}")
                for std_k, alias in [("xmin", "x1"), ("ymin", "y1"), ("xmax", "x2"), ("ymax", "y2")]:
                    if alias in clean_header:
                        col_map[std_k] = clean_header.index(alias)

        for row in reader:
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
                    boxes.append((xmin, ymin, xmax, ymax))
            except Exception:
                continue

    return boxes


def prepare_training_csvs(
    eval_dir: Path,
    val_images: Optional[list[str]] = None,
    val_ratio: float = 0.34,
) -> tuple[Path, Path, list[str], list[str]]:
    """Convert ground-truth labels to DeepForest CSVs and split into train and val."""
    pairs = find_label_pairs(eval_dir)
    if not pairs:
        raise ValueError(f"No labeled images found in {eval_dir}")

    all_names = [img.name for img, _ in pairs]
    selected_val: list[str] = []

    if val_images:
        # Match user-provided validation filenames
        for v in val_images:
            matched = [name for name in all_names if name.lower() == v.lower() or Path(name).stem.lower() == v.lower()]
            if matched:
                selected_val.extend(matched)
            else:
                logger.warning("Specified validation image '%s' not found in %s", v, eval_dir)
        selected_val = sorted(list(set(selected_val)))

    # Fallback to automated split if not specified or empty
    if not selected_val:
        if len(pairs) == 1:
            # Only 1 image — cannot hold out a full image without leaving 0 for training
            raise ValueError(
                f"Only 1 labeled image found ({pairs[0][0].name}). Need at least 2 labeled images "
                f"to maintain a held-out validation set."
            )
        elif len(pairs) == 2:
            # Hold out single_tree_isolated if present, or the smaller image
            isolated = [img.name for img, _ in pairs if "isolated" in img.name.lower() or "single" in img.name.lower()]
            if isolated:
                selected_val = [isolated[0]]
            else:
                selected_val = [pairs[0][0].name]
        else:
            # >= 3 images: hold out at least 1-2 images according to val_ratio
            num_val = max(1, min(len(pairs) - 1, round(len(pairs) * val_ratio)))
            # Prioritize isolated or sparse test sets for validation
            sorted_by_preference = sorted(
                all_names,
                key=lambda n: (0 if "isolated" in n.lower() else (1 if "sparse" in n.lower() else 2)),
            )
            selected_val = sorted_by_preference[:num_val]

    train_names = [n for n in all_names if n not in selected_val]
    if not train_names:
        raise ValueError("Train split is empty! Please ensure at least one image is allocated for training.")

    train_csv_path = eval_dir / "train.csv"
    val_csv_path = eval_dir / "val.csv"

    # Write train.csv
    train_box_count = 0
    with open(train_csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["image_path", "xmin", "ymin", "xmax", "ymax", "label"])
        for img_path, label_path in pairs:
            if img_path.name in train_names:
                boxes = load_boxes_from_csv(label_path)
                train_box_count += len(boxes)
                for xmin, ymin, xmax, ymax in boxes:
                    writer.writerow([img_path.name, xmin, ymin, xmax, ymax, "Tree"])

    # Write val.csv
    val_box_count = 0
    with open(val_csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["image_path", "xmin", "ymin", "xmax", "ymax", "label"])
        for img_path, label_path in pairs:
            if img_path.name in selected_val:
                boxes = load_boxes_from_csv(label_path)
                val_box_count += len(boxes)
                for xmin, ymin, xmax, ymax in boxes:
                    writer.writerow([img_path.name, xmin, ymin, xmax, ymax, "Tree"])

    logger.info("Dataset Preparation Complete:")
    logger.info("  Training Set:   %d image(s) (%s) | %d total boxes -> %s", len(train_names), ", ".join(train_names), train_box_count, train_csv_path.name)
    logger.info("  Validation Set: %d image(s) (%s) | %d total boxes -> %s", len(selected_val), ", ".join(selected_val), val_box_count, val_csv_path.name)

    return train_csv_path, val_csv_path, train_names, selected_val


def run_local_training(
    eval_dir: Path,
    train_csv: Path,
    val_csv: Path,
    output_model: Path,
    epochs: int = 5,
    learning_rate: float = 1e-5,
    batch_size: int = 1,
) -> Path:
    """Fine-tune DeepForest locally using PyTorch Lightning trainer."""
    import torch
    from deepforest import main

    logger.info("Initializing DeepForest release model as pre-trained starting point...")
    model = main.deepforest()
    model.load_model()

    # Configure training parameters
    model.config["train"]["csv_file"] = str(train_csv)
    model.config["train"]["root_dir"] = str(eval_dir)
    model.config["validation"]["csv_file"] = str(val_csv)
    model.config["validation"]["root_dir"] = str(eval_dir)
    model.config["train"]["epochs"] = epochs
    model.config["train"]["lr"] = learning_rate
    model.config["batch_size"] = batch_size
    model.config["train"]["preload_images"] = True

    logger.info("Creating trainer with %d epochs, learning rate %g...", epochs, learning_rate)
    model.create_trainer()

    start_t = time.perf_counter()
    logger.info("Starting fine-tuning...")
    model.trainer.fit(model)
    duration = time.perf_counter() - start_t
    logger.info("Fine-tuning completed in %.1f seconds.", duration)

    output_model.parent.mkdir(parents=True, exist_ok=True)
    # Save checkpoint via DeepForest save_model and direct state_dict
    model.save_model(str(output_model))
    # Also save direct state_dict for lightweight loading
    torch.save(model.model.state_dict(), str(output_model))
    logger.info("Saved fine-tuned checkpoint to: %s", output_model)
    return output_model


# ---------------------------------------------------------------------------
# Modal Remote Execution Support
# ---------------------------------------------------------------------------
try:
    import modal

    finetune_app = modal.App("canopylens-finetune")
    try:
        sys.path.insert(0, str(BACKEND_DIR))
        from modal_app import image as finetune_image, volume as finetune_volume, VOLUME_MOUNT
    except Exception:
        finetune_volume = modal.Volume.from_name("canopylens-data", create_if_missing=True)
        VOLUME_MOUNT = "/canopylens-data"
        finetune_image = (
            modal.Image.from_registry("nvidia/cuda:12.1.0-cudnn8-devel-ubuntu22.04", add_python="3.11")
            .apt_install("libgl1", "libglib2.0-0", "gdal-bin", "libgdal-dev", "git")
            .pip_install(
                "torch==2.4.1+cu121",
                "torchvision==0.19.1+cu121",
                extra_index_url="https://download.pytorch.org/whl/cu121",
            )
            .pip_install(
                "deepforest",
                "pandas",
                "rasterio",
                "shapely",
                "opencv-python-headless",
            )
        )

    @finetune_app.function(
        image=finetune_image,
        gpu="T4",
        timeout=900,
        volumes={VOLUME_MOUNT: finetune_volume},
    )
    def train_on_modal(
        image_files_bytes: dict[str, bytes],
        train_csv_content: str,
        val_csv_content: str,
        epochs: int = 5,
        learning_rate: float = 1e-5,
    ) -> bytes:
        """Remote Modal worker: executes fine-tuning on T4 GPU and returns model bytes."""
        import os
        import torch
        from deepforest import main

        work_dir = Path("/tmp/finetune_data")
        work_dir.mkdir(parents=True, exist_ok=True)

        # Write image files
        for fname, bdata in image_files_bytes.items():
            (work_dir / fname).write_bytes(bdata)

        # Write CSV files
        train_csv_path = work_dir / "train.csv"
        val_csv_path = work_dir / "val.csv"
        train_csv_path.write_text(train_csv_content, encoding="utf-8")
        val_csv_path.write_text(val_csv_content, encoding="utf-8")

        print(f"[Modal GPU] Initializing DeepForest pretrained release model...")
        model = main.deepforest()
        model.load_model()

        model.config["train"]["csv_file"] = str(train_csv_path)
        model.config["train"]["root_dir"] = str(work_dir)
        model.config["validation"]["csv_file"] = str(val_csv_path)
        model.config["validation"]["root_dir"] = str(work_dir)
        model.config["train"]["epochs"] = epochs
        model.config["train"]["lr"] = learning_rate
        model.config["batch_size"] = 1
        model.config["train"]["preload_images"] = True

        print(f"[Modal GPU] Training for {epochs} epochs at lr={learning_rate} on T4 GPU...")
        model.create_trainer()
        model.trainer.fit(model)

        # Save to volume at /canopylens-data/models/deepforest_finetuned.pt
        vol_models_dir = Path(f"{VOLUME_MOUNT}/models")
        vol_models_dir.mkdir(parents=True, exist_ok=True)
        vol_ckpt_path = vol_models_dir / "deepforest_finetuned.pt"
        torch.save(model.model.state_dict(), str(vol_ckpt_path))
        try:
            finetune_volume.commit()
            print("[Modal GPU] Committed checkpoint to Modal volume.")
        except Exception as e:
            print(f"[Modal GPU] Note on volume commit: {e}")

        # Return serialized state_dict
        import io
        buf = io.BytesIO()
        torch.save(model.model.state_dict(), buf)
        buf.seek(0)
        return buf.getvalue()

    @finetune_app.local_entrypoint()
    def modal_main():
        pass

except ImportError:
    modal = None


def run_remote_modal_training(
    eval_dir: Path,
    train_csv: Path,
    val_csv: Path,
    output_model: Path,
    epochs: int = 5,
    learning_rate: float = 1e-5,
) -> Path:
    """Package dataset, run training on Modal GPU, and download result."""
    if modal is None:
        raise RuntimeError("Modal is not installed. Install via `pip install modal` to train remotely.")

    logger.info("Packaging dataset for Modal T4 GPU execution...")
    image_files_bytes: dict[str, bytes] = {}
    for p in eval_dir.iterdir():
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS:
            image_files_bytes[p.name] = p.read_bytes()

    train_content = train_csv.read_text(encoding="utf-8")
    val_content = val_csv.read_text(encoding="utf-8")

    logger.info("Submitting fine-tuning task to Modal GPU (epochs=%d, lr=%g)...", epochs, learning_rate)
    with finetune_app.run():
        model_bytes = train_on_modal.remote(
            image_files_bytes=image_files_bytes,
            train_csv_content=train_content,
            val_csv_content=val_content,
            epochs=epochs,
            learning_rate=learning_rate,
        )

    output_model.parent.mkdir(parents=True, exist_ok=True)
    output_model.write_bytes(model_bytes)
    logger.info("Downloaded fine-tuned weights (%d bytes) to: %s", len(model_bytes), output_model)
    return output_model


def main() -> int:
    parser = argparse.ArgumentParser(
        description="CanopyLens DeepForest Fine-Tuning on Hand-Labeled Aerial Imagery"
    )
    parser.add_argument(
        "--eval-dir",
        default=str(EVAL_DATA_DIR),
        help="Path to directory containing hand-labeled images and *_labels.csv files (default: backend/eval_data)",
    )
    parser.add_argument(
        "--val-images",
        nargs="+",
        default=None,
        help="Specific image filename(s) to hold out for validation (e.g. --val-images single_tree_isolated.jpg)",
    )
    parser.add_argument(
        "--val-ratio",
        type=float,
        default=0.34,
        help="Validation split ratio if --val-images not specified (default: 0.34)",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=5,
        help="Number of fine-tuning epochs (default: 5, recommended: 5-10)",
    )
    parser.add_argument(
        "--lr",
        type=float,
        default=1e-5,
        help="Learning rate for fine-tuning (default: 1e-5)",
    )
    parser.add_argument(
        "--output-model",
        default=str(DEFAULT_OUTPUT_MODEL),
        help="Destination path for fine-tuned checkpoint (default: backend/models/deepforest_finetuned.pt)",
    )
    parser.add_argument(
        "--remote-modal",
        action="store_true",
        help="Force remote training on Modal GPU (T4)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Prepare train.csv and val.csv without launching training",
    )

    args = parser.parse_args()
    eval_dir = Path(args.eval_dir).resolve()
    output_model = Path(args.output_model).resolve()

    if not eval_dir.is_dir():
        logger.error("Evaluation directory does not exist: %s", eval_dir)
        return 1

    try:
        train_csv, val_csv, train_names, val_names = prepare_training_csvs(
            eval_dir=eval_dir,
            val_images=args.val_images,
            val_ratio=args.val_ratio,
        )
    except Exception as exc:
        logger.error("Failed to prepare dataset: %s", exc)
        return 1

    if args.dry_run:
        logger.info("[Dry Run] Successfully created train.csv and val.csv. Exiting without training.")
        return 0

    # Determine execution mode: local vs remote Modal
    can_run_local = False
    try:
        import deepforest  # noqa: F401
        can_run_local = True
    except ImportError:
        can_run_local = False

    use_remote = args.remote_modal or not can_run_local
    if use_remote:
        logger.info("Executing training remotely on Modal GPU...")
        try:
            run_remote_modal_training(
                eval_dir=eval_dir,
                train_csv=train_csv,
                val_csv=val_csv,
                output_model=output_model,
                epochs=args.epochs,
                learning_rate=args.lr,
            )
        except Exception as exc:
            logger.error("Remote Modal training failed: %s", exc)
            return 1
    else:
        logger.info("Executing training locally...")
        try:
            run_local_training(
                eval_dir=eval_dir,
                train_csv=train_csv,
                val_csv=val_csv,
                output_model=output_model,
                epochs=args.epochs,
                learning_rate=args.lr,
            )
        except Exception as exc:
            logger.error("Local training failed: %s", exc)
            return 1

    logger.info("\nFine-Tuning Execution Complete!")
    logger.info("Saved Checkpoint: %s", output_model)
    logger.info("Held-Out Validation Images: %s", ", ".join(val_names))
    logger.info("To evaluate against stock model, run: python backend/scripts/evaluate.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
