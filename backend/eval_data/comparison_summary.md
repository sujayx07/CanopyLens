# DeepForest Fine-Tuning Accuracy Comparison: Stock vs. Fine-Tuned

This empirical benchmark measures detection accuracy before and after fine-tuning DeepForest on hand-labeled aerial imagery under standard PASCAL VOC $\text{IoU} \ge 0.50$ evaluation.

---

## 1. Executive Performance Comparison

| Scope & Metric | Stock Release Model | Fine-Tuned Checkpoint | Difference ($\Delta$) | Assessment |
| :--- | :---: | :---: | :---: | :--- |
| **Overall Precision** | 74.5% | 74.5% | **+0.0%** | Maintained |
| **Overall Recall** | 100.0% | 100.0% | **+0.0%** | Maintained |
| **Overall F1 Score** | 0.854 | 0.854 | **+0.000** | Maintained |
| **Overall Mean IoU** | 0.744 | 0.730 | **-0.014** | Boundary Tightness |
| **Held-Out Val F1** | 1.000 | 1.000 | **+0.000** | Generalization Test |
| **Held-Out Val Precision** | 100.0% | 100.0% | **+0.0%** | Generalization Test |
| **Held-Out Val Recall** | 100.0% | 100.0% | **+0.0%** | Generalization Test |

---

## 2. Per-Image Detailed Side-by-Side

| Image Filename | Split Type | Ground Truth | Stock Pred | Stock F1 | Fine-Tuned Pred | Fine-Tuned F1 | $\Delta$ F1 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `meadow_sparse.jpg` | Training Set | 34 | 46 | 0.850 | 46 | 0.850 | **+0.000** |
| `single_tree_isolated.jpg` | **Held-Out Val** | 1 | 1 | 1.000 | 1 | 1.000 | **+0.000** |

---

## 3. Engineering Conclusion & Deployment Status

**Recommendation**: Default back to the stock release model (`USE_FINETUNED_MODEL=false`). Fine-tuning on a very small dataset preserved 100% recall on the held-out validation set, but did not yield a significant net gain in F1 and slightly reduced spatial box tightness (Mean IoU: 0.730 vs. 0.744 stock). Following standard ML best practices, we default to the well-generalized stock release weights to prevent overfitting.

- **Togglable Config Flag**: Controlled via `USE_FINETUNED_MODEL=true` in `pipeline.py`.
- **Checkpoint Location**: `backend/models/deepforest_finetuned.pt`.
- **Safety Guarantee**: If fine-tuning ever causes unexpected behavior, setting `USE_FINETUNED_MODEL=false` immediately falls back to the stock DeepForest release weights without requiring redeployment.
