import os
import pymongo
import pandas as pd
from datetime import datetime

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "aarambh")

def extract_data():
    client = pymongo.MongoClient(MONGO_URI)
    db = client[MONGO_DB]
    
    print("Extracting historical interactions...")
    # This is a skeleton. Actual extraction requires complex point-in-time joins.
    # Currently blocked by 0 records.
    records = list(db.learningrecommendations.find({"status": {"$in": ["enrolled", "completed", "dismissed"]}}))
    
    if len(records) == 0:
        print("ML TRAINING IS BLOCKED BY INSUFFICIENT HISTORICAL DATA.")
        return
    
    # Placeholder for feature engineering logic
    df = pd.DataFrame(records)
    df.to_csv("data/training_data.csv", index=False)
    print(f"Exported {len(df)} records.")

if __name__ == "__main__":
    extract_data()
