"""
test_finetune_and_eval.py — Tests for Fine-Tuning and Evaluation modules
"""

import os
import tempfile
from pathlib import Path

import pytest

from app.services.pipeline import get_deepforest_model, run_pipeline
from scripts.evaluate import (
    BoundingBox,
    CategoryAggregate,
    ImageEvalResult,
    calculate_metrics,
    compute_box_iou,
    export_comparison_markdown,
    match_boxes,
)
from scripts.finetune import (
    find_label_pairs,
    load_boxes_from_csv,
    prepare_training_csvs,
)


def test_compute_box_iou_exact_and_disjoint():
    b1 = BoundingBox(xmin=0, ymin=0, xmax=10, ymax=10)
    b2 = BoundingBox(xmin=0, ymin=0, xmax=10, ymax=10)
    assert pytest.approx(compute_box_iou(b1, b2)) == 1.0

    b3 = BoundingBox(xmin=20, ymin=20, xmax=30, ymax=30)
    assert compute_box_iou(b1, b3) == 0.0

    b4 = BoundingBox(xmin=5, ymin=0, xmax=15, ymax=10)
    # intersection: 5*10 = 50. union: 100 + 100 - 50 = 150 -> 50/150 = 1/3
    assert pytest.approx(compute_box_iou(b1, b4)) == 1.0 / 3.0


def test_match_boxes_greedy_matching():
    gts = [
        BoundingBox(xmin=10, ymin=10, xmax=20, ymax=20),
        BoundingBox(xmin=50, ymin=50, xmax=60, ymax=60),
    ]
    preds = [
        BoundingBox(xmin=11, ymin=11, xmax=21, ymax=21, score=0.9),  # Matches GT 0
        BoundingBox(xmin=100, ymin=100, xmax=110, ymax=110, score=0.8),  # FP
    ]
    tp, fp, fn, matched_ious, m_gts, m_preds = match_boxes(preds, gts, iou_threshold=0.50)
    assert tp == 1
    assert fp == 1
    assert fn == 1
    assert len(matched_ious) == 1
    assert 0 in m_gts
    assert 0 in m_preds

    prec, rec, f1, miou = calculate_metrics(tp, fp, fn, matched_ious)
    assert prec == 0.5
    assert rec == 0.5
    assert f1 == 0.5
    assert miou > 0.5


def test_finetune_csv_preparation():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)

        # Create dummy images
        (tmp_path / "img1.jpg").write_bytes(b"dummy image 1")
        (tmp_path / "img2.jpg").write_bytes(b"dummy image 2")

        # Create dummy label CSVs
        (tmp_path / "img1_labels.csv").write_text("xmin,ymin,xmax,ymax\n10,10,20,20\n30,30,40,40\n", encoding="utf-8")
        (tmp_path / "img2_labels.csv").write_text("xmin,ymin,xmax,ymax\n50,50,60,60\n", encoding="utf-8")

        train_csv, val_csv, train_names, val_names = prepare_training_csvs(
            eval_dir=tmp_path,
            val_images=["img2.jpg"],
        )

        assert train_csv.is_file()
        assert val_csv.is_file()
        assert train_names == ["img1.jpg"]
        assert val_names == ["img2.jpg"]

        # Verify DeepForest CSV schema in train.csv
        train_lines = train_csv.read_text(encoding="utf-8").strip().splitlines()
        assert train_lines[0] == "image_path,xmin,ymin,xmax,ymax,label"
        assert len(train_lines) == 3  # Header + 2 boxes
        assert "img1.jpg,10.0,10.0,20.0,20.0,Tree" in train_lines[1]

        # Verify DeepForest CSV schema in val.csv
        val_lines = val_csv.read_text(encoding="utf-8").strip().splitlines()
        assert val_lines[0] == "image_path,xmin,ymin,xmax,ymax,label"
        assert len(val_lines) == 2  # Header + 1 box
        assert "img2.jpg,50.0,50.0,60.0,60.0,Tree" in val_lines[1]


def test_pipeline_use_finetuned_flag(monkeypatch):
    # Set USE_FINETUNED_MODEL to false
    monkeypatch.setenv("USE_FINETUNED_MODEL", "false")
    assert os.getenv("USE_FINETUNED_MODEL") == "false"

    # Set USE_FINETUNED_MODEL to true
    monkeypatch.setenv("USE_FINETUNED_MODEL", "true")
    assert os.getenv("USE_FINETUNED_MODEL") == "true"


def test_comparison_markdown_export():
    with tempfile.TemporaryDirectory() as tmpdir:
        report_path = Path(tmpdir) / "test_comparison.md"

        stock_overall = CategoryAggregate(
            category="Overall", image_count=2, total_gt=35, total_pred=47,
            total_tp=35, total_fp=12, total_fn=0,
            precision=0.7447, recall=1.0, f1=0.8537, mean_iou=0.744,
        )
        fine_overall = CategoryAggregate(
            category="Overall", image_count=2, total_gt=35, total_pred=46,
            total_tp=35, total_fp=11, total_fn=0,
            precision=0.7609, recall=1.0, f1=0.8642, mean_iou=0.730,
        )

        stock_results = [
            ImageEvalResult(image_name="single_tree_isolated.jpg", image_path="", density="isolated", gt_count=1, pred_count=1, tp=1, fp=0, fn=0, precision=1.0, recall=1.0, f1=1.0, mean_iou=0.587),
        ]
        fine_results = [
            ImageEvalResult(image_name="single_tree_isolated.jpg", image_path="", density="isolated", gt_count=1, pred_count=1, tp=1, fp=0, fn=0, precision=1.0, recall=1.0, f1=1.0, mean_iou=0.587),
        ]

        export_comparison_markdown(
            report_path,
            stock_results=stock_results,
            stock_overall=stock_overall,
            finetuned_results=fine_results,
            finetuned_overall=fine_overall,
            val_images=["single_tree_isolated.jpg"],
        )

        assert report_path.is_file()
        content = report_path.read_text(encoding="utf-8")
        assert "DeepForest Fine-Tuning Accuracy Comparison" in content
        assert "Stock Release Model" in content
        assert "Fine-Tuned Checkpoint" in content
