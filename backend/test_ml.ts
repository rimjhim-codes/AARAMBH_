import { rerankCandidatesML } from "./src/services/recommendation.ml";

async function run() {
    const candidates = [
        { courseId: "c1", relevanceScore: 80, durationHours: 10, difficulty: "Beginner" },
        { courseId: "c2", relevanceScore: 60, durationHours: 20, difficulty: "Intermediate" }
    ];
    const context = { profile: {}, gaps: [] };
    
    console.log("Running ML inference...");
    try {
        const result = await rerankCandidatesML(candidates, context);
        console.log(result);
    } catch (err) {
        console.error(err);
    }
}

run().catch(console.error);
