import pandas as pd
import numpy as np
import uuid
import os
from datetime import datetime, timedelta

# FIXED SEED FOR REPRODUCIBILITY
np.random.seed(42)

NUM_LEARNERS = 1000
NUM_COURSES = 200
INTERACTIONS_PER_LEARNER = 15

print("==================================================================")
print("GENERATING SYNTHETIC DEVELOPMENT DATA FOR ML PIPELINE VALIDATION")
print("DO NOT USE AS REAL WORLD DATA. THIS IS PURELY FOR PIPELINE TESTING.")
print("==================================================================")

# 1. Generate Competencies
domains = ["Data Science", "Statistics", "Leadership", "Communication", "Data Engineering", "Project Management"]

# 2. Generate Synthetic Courses
courses = []
for i in range(NUM_COURSES):
    domain = np.random.choice(domains)
    difficulty = np.random.choice(["beginner", "intermediate", "advanced"], p=[0.5, 0.3, 0.2])
    courses.append({
        "courseId": f"COURSE_{i}",
        "course_title": f"{domain} {difficulty.capitalize()} Course",
        "course_difficulty": difficulty,
        "course_durationHours": np.random.uniform(1.0, 40.0),
        "course_provider": np.random.choice(["ARAMBH Platform Catalog", "iGOT", "NSSTA"]),
        "course_competency": domain
    })
df_courses = pd.DataFrame(courses)

# 3. Generate Synthetic Learners
learners = []
departments = ["Statistics", "Finance", "HR", "IT", "Operations"]
roles = ["Analyst", "Manager", "Director", "Specialist"]

for i in range(NUM_LEARNERS):
    learner_id = f"USER_{i}"
    # Assign a primary competency gap
    primary_gap_domain = np.random.choice(domains)
    req_level = np.random.randint(3, 6)
    curr_level = np.random.randint(1, req_level) if req_level > 1 else 1
    
    learners.append({
        "userId": learner_id,
        "user_jobRole": np.random.choice(roles),
        "user_department": np.random.choice(departments),
        "user_primaryGapDomain": primary_gap_domain,
        "user_currentLevel": curr_level,
        "user_requiredLevel": req_level,
        "user_skillGap": req_level - curr_level,
        "user_quizAttempts": np.random.randint(0, 20),
        "user_averageQuizPercentage": np.random.uniform(40, 100)
    })
df_learners = pd.DataFrame(learners)

# 4. Generate Interactions
interactions = []

start_date = datetime(2025, 1, 1)

for _, learner in df_learners.iterrows():
    # Select courses for this learner
    # Bias selection towards their gap domain
    learner_courses = df_courses.copy()
    
    # Calculate deterministic relevance baseline for simulation
    # Match domain = +50
    # Gap * 10 = +X
    learner_courses["relevance_score"] = np.where(
        learner_courses["course_competency"] == learner["user_primaryGapDomain"],
        50 + (learner["user_skillGap"] * 10),
        np.random.uniform(10, 40, size=len(learner_courses))
    )
    
    # Sample top courses
    sampled_courses = learner_courses.sort_values(by="relevance_score", ascending=False).head(INTERACTIONS_PER_LEARNER)
    
    # Simulate temporal interactions over a year
    current_date = start_date + timedelta(days=np.random.randint(0, 100))
    
    group_id = str(uuid.uuid4()) # Represents a single recommendation impression query
    
    for rank, (_, course) in enumerate(sampled_courses.iterrows()):
        
        # Add slight noise to baseline rank to simulate actual system
        context_relevanceScore = course["relevance_score"] + np.random.normal(0, 5)
        
        # Calculate true probability of positive interaction
        # Higher skill gap -> higher probability
        # Matches gap domain -> much higher probability
        # Advanced course for beginner -> very low probability
        
        prob_enroll = 0.1
        
        if course["course_competency"] == learner["user_primaryGapDomain"]:
            prob_enroll += 0.3
            
        prob_enroll += (learner["user_skillGap"] * 0.05)
        
        if learner["user_currentLevel"] < 2 and course["course_difficulty"] == "advanced":
            prob_enroll -= 0.3
            
        if learner["user_currentLevel"] >= 4 and course["course_difficulty"] == "beginner":
            prob_enroll -= 0.2
            
        prob_enroll = max(0.01, min(0.99, prob_enroll))
        
        # Outcome: 1 for completed/enrolled, 0 for dismissed/ignored
        is_positive = np.random.random() < prob_enroll
        outcome = np.random.choice(["completed", "enrolled"]) if is_positive else np.random.choice(["dismissed", "recommended"])
        label = 1 if is_positive else 0
        
        interactions.append({
            "interactionId": str(uuid.uuid4()),
            "query_group_id": group_id, # critical for rank:pairwise
            "userId": learner["userId"],
            "courseId": course["courseId"],
            "timestamp": current_date.isoformat(),
            
            # Point-in-time features (Copied exactly at impression time)
            "user_currentLevel": learner["user_currentLevel"],
            "user_requiredLevel": learner["user_requiredLevel"],
            "user_skillGap": learner["user_skillGap"],
            "user_quizAttempts": learner["user_quizAttempts"],
            "user_averageQuizPercentage": learner["user_averageQuizPercentage"],
            "user_jobRole": learner["user_jobRole"],
            "user_department": learner["user_department"],
            
            "course_difficulty": course["course_difficulty"],
            "course_durationHours": course["course_durationHours"],
            "course_provider": course["course_provider"],
            
            "context_relevanceScore": context_relevanceScore,
            
            # Label
            "status": outcome,
            "label": label
        })
        
        current_date += timedelta(minutes=np.random.randint(1, 60))

df_interactions = pd.DataFrame(interactions)

# 5. Save Datasets
os.makedirs("data", exist_ok=True)
df_courses.to_csv("data/synthetic_courses.csv", index=False)
df_learners.to_csv("data/synthetic_learners.csv", index=False)
df_interactions.to_csv("data/synthetic_training_dataset.csv", index=False)

print(f"Generated {NUM_LEARNERS} synthetic learners.")
print(f"Generated {NUM_COURSES} synthetic courses.")
print(f"Generated {len(df_interactions)} synthetic interactions.")
print("Saved to data/synthetic_training_dataset.csv")
