import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import ndcg_score
from onnxmltools.convert import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType
import json
import datetime
import os

print("==================================================================")
print("TRAINING XGBOOST RANKER ON SYNTHETIC DEVELOPMENT DATA")
print("DO NOT USE AS REAL WORLD PERFORMANCE METRICS.")
print("==================================================================")

def precision_at_k(y_true, y_pred, k):
    # Sort indices by prediction
    sorted_indices = np.argsort(y_pred)[::-1]
    top_k_indices = sorted_indices[:k]
    # Calculate precision
    relevant_in_top_k = np.sum(y_true[top_k_indices])
    return relevant_in_top_k / k if k > 0 else 0.0

def recall_at_k(y_true, y_pred, k):
    sorted_indices = np.argsort(y_pred)[::-1]
    top_k_indices = sorted_indices[:k]
    total_relevant = np.sum(y_true)
    if total_relevant == 0:
        return 0.0
    relevant_in_top_k = np.sum(y_true[top_k_indices])
    return relevant_in_top_k / total_relevant

def mrr(y_true, y_pred):
    sorted_indices = np.argsort(y_pred)[::-1]
    for rank, idx in enumerate(sorted_indices):
        if y_true[idx] > 0:
            return 1.0 / (rank + 1)
    return 0.0

def average_precision(y_true, y_pred):
    sorted_indices = np.argsort(y_pred)[::-1]
    total_relevant = np.sum(y_true)
    if total_relevant == 0:
        return 0.0
    relevant_count = 0
    ap_sum = 0.0
    for rank, idx in enumerate(sorted_indices):
        if y_true[idx] > 0:
            relevant_count += 1
            ap_sum += relevant_count / (rank + 1)
    return ap_sum / total_relevant

def train():
    if not os.path.exists("data/synthetic_training_dataset.csv"):
        print("Missing synthetic dataset. Run generate_synthetic_data.py first.")
        return

    df = pd.read_csv("data/synthetic_training_dataset.csv")
    
    # Sort by timestamp for temporal split
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values(by=["timestamp", "query_group_id"])
    
    # Feature engineering (One-Hot Encoding for categorical features as basic prep)
    categorical_cols = ["user_jobRole", "user_department", "course_difficulty", "course_provider"]
    df_encoded = pd.get_dummies(df, columns=categorical_cols, drop_first=True)
    
    feature_cols = [c for c in df_encoded.columns if c not in ["interactionId", "query_group_id", "userId", "courseId", "timestamp", "status", "label", "relevance_score"]]
    
    # We must ensure we have a stable feature order for ONNX inference.
    # In a real system, we'd save the exact one-hot encoder or use native categorical support in XGBoost
    
    print(f"Total interactions: {len(df)}")
    print(f"Number of courses: {df['courseId'].nunique()}")
    print(f"Number of users: {df['userId'].nunique()}")
    
    # Temporal Split
    n = len(df_encoded)
    train_idx = int(n * 0.7)
    val_idx = int(n * 0.85)
    
    train_df = df_encoded.iloc[:train_idx]
    val_df = df_encoded.iloc[train_idx:val_idx]
    test_df = df_encoded.iloc[val_idx:]
    
    print(f"Train size: {len(train_df)}")
    print(f"Validation size: {len(val_df)}")
    print(f"Test size: {len(test_df)}")
    print(f"Overall Label Distribution:\n{df['label'].value_counts(normalize=True)}")
    
    # Prepare DMatrix for XGBoost rank:pairwise
    # XGBoost requires groups (query_group_id) for ranking
    
    def prepare_dmatrix(data_df):
        # Sort by group to satisfy XGBoost requirement
        data_df = data_df.sort_values(by="query_group_id")
        X = data_df[feature_cols].astype(float)
        # Rename columns to f0, f1, etc for ONNX export compatibility
        X.columns = [f"f{i}" for i in range(len(feature_cols))]
        y = data_df["label"].astype(float)
        group = data_df.groupby("query_group_id").size().values
        # Also return baseline scores for comparison
        baseline = data_df["context_relevanceScore"].values
        return xgb.DMatrix(X, label=y, group=group), data_df["query_group_id"].values, y.values, baseline

    dtrain, _, _, _ = prepare_dmatrix(train_df)
    dval, _, _, _ = prepare_dmatrix(val_df)
    dtest, test_groups, test_labels, test_baseline = prepare_dmatrix(test_df)
    
    params = {
        "objective": "rank:pairwise",
        "learning_rate": 0.1,
        "max_depth": 5,
        "eval_metric": "ndcg",
        "seed": 42
    }
    
    print("\nTraining XGBoost rank:pairwise model...")
    bst = xgb.train(params, dtrain, num_boost_round=50, evals=[(dval, "val")], early_stopping_rounds=10, verbose_eval=False)
    
    print("\nEvaluating on TEST set...")
    # Predict on test set
    preds = bst.predict(dtest)
    
    # Calculate metrics group by group
    unique_groups = np.unique(test_groups)
    
    metrics = {"baseline": {"ndcg": [], "p8": [], "r8": [], "mrr": [], "map": []},
               "ml": {"ndcg": [], "p8": [], "r8": [], "mrr": [], "map": []}}
    
    for g in unique_groups:
        idx = np.where(test_groups == g)[0]
        y_true = test_labels[idx]
        y_base = test_baseline[idx]
        y_ml = preds[idx]
        
        if np.sum(y_true) == 0:
            continue # Skip groups with no positive labels
            
        # Baseline Metrics
        if len(y_true) > 1:
            try:
                metrics["baseline"]["ndcg"].append(ndcg_score([y_true], [y_base], k=8))
                metrics["ml"]["ndcg"].append(ndcg_score([y_true], [y_ml], k=8))
            except:
                pass
                
        metrics["baseline"]["p8"].append(precision_at_k(y_true, y_base, 8))
        metrics["ml"]["p8"].append(precision_at_k(y_true, y_ml, 8))
        
        metrics["baseline"]["r8"].append(recall_at_k(y_true, y_base, 8))
        metrics["ml"]["r8"].append(recall_at_k(y_true, y_ml, 8))
        
        metrics["baseline"]["mrr"].append(mrr(y_true, y_base))
        metrics["ml"]["mrr"].append(mrr(y_true, y_ml))
        
        metrics["baseline"]["map"].append(average_precision(y_true, y_base))
        metrics["ml"]["map"].append(average_precision(y_true, y_ml))
        
    print("\n--- RESULTS ---")
    b_ndcg = np.mean(metrics["baseline"]["ndcg"])
    b_p8 = np.mean(metrics["baseline"]["p8"])
    b_r8 = np.mean(metrics["baseline"]["r8"])
    b_mrr = np.mean(metrics["baseline"]["mrr"])
    b_map = np.mean(metrics["baseline"]["map"])
    
    m_ndcg = np.mean(metrics["ml"]["ndcg"])
    m_p8 = np.mean(metrics["ml"]["p8"])
    m_r8 = np.mean(metrics["ml"]["r8"])
    m_mrr = np.mean(metrics["ml"]["mrr"])
    m_map = np.mean(metrics["ml"]["map"])
    
    print("DETERMINISTIC BASELINE")
    print(f"NDCG@8:      {b_ndcg:.4f}")
    print(f"Precision@8: {b_p8:.4f}")
    print(f"Recall@8:    {b_r8:.4f}")
    print(f"MRR:         {b_mrr:.4f}")
    print(f"MAP:         {b_map:.4f}")
    
    print("\nXGBOOST ML")
    print(f"NDCG@8:      {m_ndcg:.4f}")
    print(f"Precision@8: {m_p8:.4f}")
    print(f"Recall@8:    {m_r8:.4f}")
    print(f"MRR:         {m_mrr:.4f}")
    print(f"MAP:         {m_map:.4f}")
    
    print("\nIMPROVEMENT")
    print(f"NDCG@8:      {((m_ndcg/b_ndcg)-1)*100:.2f}%")
    print(f"Precision@8: {((m_p8/b_p8)-1)*100:.2f}%")
    print(f"Recall@8:    {((m_r8/b_r8)-1)*100:.2f}%")
    print(f"MRR:         {((m_mrr/b_mrr)-1)*100:.2f}%")
    print(f"MAP:         {((m_map/b_map)-1)*100:.2f}%")

    print("\nExporting to ONNX...")
    # Number of features
    num_features = len(feature_cols)
    initial_type = [('float_input', FloatTensorType([None, num_features]))]
    
    onnx_model = convert_xgboost(bst, initial_types=initial_type)
    
    os.makedirs("models", exist_ok=True)
    with open("models/recommendation_ranker.onnx", "wb") as f:
        f.write(onnx_model.SerializeToString())
        
    print("Exported ONNX model.")
    
    # Save metadata
    metadata = {
        "model_type": "XGBoost",
        "objective": "rank:pairwise",
        "dataset_type": "SYNTHETIC_DEVELOPMENT_DATA",
        "training_sample_count": len(train_df),
        "timestamp": datetime.datetime.now().isoformat(),
        "model_version": "0.1.0-synthetic",
        "feature_ordering": feature_cols,
        "evaluation_metrics": {
            "ml_ndcg8": float(m_ndcg),
            "ml_mrr": float(m_mrr)
        }
    }
    
    with open("models/model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
        
    print("Exported model metadata. Pipeline complete.")

if __name__ == "__main__":
    train()
