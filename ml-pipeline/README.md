# Aarambh ML Recommendation Pipeline

This directory contains the data extraction, feature engineering, and model training scripts required for the Real ML Recommendation Engine (Phase D).

## Status: BLOCKED BY INSUFFICIENT DATA
The database currently holds 0 historical interactions. We are building the ML feature extraction and ONNX inference layers, but the actual XGBoost model training cannot occur yet.

## Methodology
The intended model is XGBoost Learning-to-Rank (`rank:pairwise`).

### Labels
- **Positive**: `status === 'enrolled'` or `status === 'completed'`
- **Negative**: `status === 'dismissed'`
- **Neutral/Ignored**: `status === 'recommended'` (without subsequent action)

### Point-in-Time Leakage Protection
Features must be extracted as they existed at the exact timestamp of the recommendation impression. Future events (like a subsequent course completion) MUST NOT be included as features.

## Usage (When data is available)
1. Set `MONGO_URI` environment variable.
2. Run `python prepare_dataset.py` to dump training CSVs.
3. Run `python train_ranker.py` to train the XGBoost model and export `model.onnx`.
