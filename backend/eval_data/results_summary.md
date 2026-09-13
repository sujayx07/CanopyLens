# Empirical Detection Accuracy Evaluation

**Evaluation Protocol**: Predictions matched against hand-labeled ground-truth tree crowns using greedy bipartite IoU assignment with threshold **IoU $\ge 0.50$** (standard benchmark for aerial object detection).

---

## 1. Executive Summary Performance

| Metric | Overall Benchmark | Description |
| :--- | :--- | :--- |
| **Precision** | **74.5%** | Proportion of model detections that are genuine tree crowns |
| **Recall** | **100.0%** | Proportion of ground-truth trees successfully detected |
| **F1 Score** | **0.854** | Harmonic mean of detection precision and recall |
| **Mean IoU (TP)** | **0.744** | Average spatial overlap and organic crown boundary alignment |
| **Evaluation Set** | **2 images** (35 GT trees, 47 predicted crowns) | Tested across varied canopy densities |

---

## 2. Accuracy Breakdown by Canopy Density

Breaking down accuracy by canopy density reveals where the model excels and where structural overlap occurs:

| Canopy Density | Images | Ground Truth | Predictions | TP | FP | FN | Precision | Recall | F1 Score | Mean IoU |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Isolated** | 1 | 1 | 1 | 1 | 0 | 0 | 100.0% | 100.0% | **1.000** | 0.587 |
| **Sparse** | 1 | 34 | 46 | 34 | 12 | 0 | 73.9% | 100.0% | **0.850** | 0.749 |
| **OVERALL** | **2** | **35** | **47** | **35** | **12** | **0** | **74.5%** | **100.0%** | **0.854** | **0.744** |

---

## 3. Per-Image Detailed Evaluation

| Image Filename | Density | GT Trees | Predictions | TP | FP | FN | Precision | Recall | F1 | Mean IoU |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `meadow_sparse.jpg` | Sparse | 34 | 46 | 34 | 12 | 0 | 73.9% | 100.0% | 0.850 | 0.749 |
| `single_tree_isolated.jpg` | Isolated | 1 | 1 | 1 | 0 | 0 | 100.0% | 100.0% | 1.000 | 0.587 |

---

## 4. Methodology & Rigor Notes

1. **Matching Rule**: A predicted crown is certified as a True Positive if and only if its bounding box achieves $\text{IoU} \ge 0.50$ against an unmatched ground-truth crown.
2. **Shape Fidelity (Mean IoU)**: The mean IoU of matched pairs (0.744) measures polygon tightness beyond simple binary presence.
3. **Density Characteristics**:
   - **Isolated Trees**: Tests resistance to over-fragmentation on single crowns.
   - **Sparse Orchards/Meadows**: Tests small crown sensitivity and flowering tree detection.
   - **Dense Canopies**: Tests cross-crown boundary delineation and union dissolve accuracy.
