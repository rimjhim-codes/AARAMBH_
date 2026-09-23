import * as ort from "onnxruntime-node";
import path from "path";
import fs from "fs";
import { FormalQuizAttemptModel } from "../models/sih/SihModels";

let inferenceSession: ort.InferenceSession | null = null;
let modelMetadata: any = null;

async function loadModel() {
    if (inferenceSession) return;
    try {
        const potentialPaths = [
            path.resolve(__dirname, "../../../ml-pipeline"), // from backend/src/services
            path.resolve(__dirname, "../../../../ml-pipeline"), // from backend/dist/src/services
            path.resolve(process.cwd(), "../ml-pipeline") // relative to backend root
        ];

        let basePath = "";
        for (const p of potentialPaths) {
            if (fs.existsSync(p)) {
                basePath = p;
                break;
            }
        }

        const modelPath = path.join(basePath, "models/recommendation_ranker.onnx");
        const metadataPath = path.join(basePath, "models/model_metadata.json");

        if (fs.existsSync(modelPath) && fs.existsSync(metadataPath)) {
            inferenceSession = await ort.InferenceSession.create(modelPath);
            modelMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
        } else {
            console.error("Model files not found at:", modelPath);
        }
    } catch (err) {
        inferenceSession = null;
    }
}

/**
 * Builds the Float32 feature tensor for a batch of candidates.
 * Must precisely match the feature_ordering from model_metadata.json.
 */
function buildFeatureTensor(candidates: any[], profile: any, gaps: any[], quizAttemptsCount: number, averageQuizPercentage: number): Float32Array {
    const numFeatures = modelMetadata.feature_ordering.length;
    const tensorData = new Float32Array(candidates.length * numFeatures);

    const userRole = profile?.jobRole || "";
    const userDept = profile?.department || "";

    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];

        // Find the specific gap context for this recommendation
        const compIdStr = String(c.competencyId);
        const gap = gaps?.find((g: any) => String(g.competencyId) === compIdStr);

        for (let j = 0; j < numFeatures; j++) {
            const featureName = modelMetadata.feature_ordering[j];
            let val = 0.0;

            // Numerical features
            if (featureName === "user_currentLevel") val = gap ? gap.currentLevel : 0.0;
            else if (featureName === "user_requiredLevel") val = gap ? gap.requiredLevel : 0.0;
            else if (featureName === "user_skillGap") val = gap ? gap.gap : 0.0;
            else if (featureName === "user_quizAttempts") val = quizAttemptsCount;
            else if (featureName === "user_averageQuizPercentage") val = averageQuizPercentage;
            else if (featureName === "course_durationHours") val = c.durationHours || 10.0;
            else if (featureName === "context_relevanceScore") val = c.relevanceScore || 50.0;

            // Categorical one-hot features
            else if (featureName.startsWith("user_jobRole_")) {
                const roleSuffix = featureName.replace("user_jobRole_", "");
                if (userRole === roleSuffix) val = 1.0;
            }
            else if (featureName.startsWith("user_department_")) {
                const deptSuffix = featureName.replace("user_department_", "");
                if (userDept === deptSuffix) val = 1.0;
            }
            else if (featureName.startsWith("course_difficulty_")) {
                if (c.difficulty && featureName.endsWith(c.difficulty.toLowerCase())) val = 1.0;
            }
            else if (featureName.startsWith("course_provider_")) {
                const providerSuffix = featureName.replace("course_provider_", "");
                if (c.provider && c.provider.toLowerCase() === providerSuffix.toLowerCase()) val = 1.0;
            }

            tensorData[i * numFeatures + j] = val;
        }
    }
    return tensorData;
}

/**
 * ML Recommendation Feature Extractor and Inference Engine
 * Fallback mode safely bypasses if model unavailable.
 */
export async function rerankCandidatesML(candidates: any[], context: any): Promise<any[]> {
    if (!candidates || candidates.length === 0) return candidates;

    try {
        await loadModel();

        if (!inferenceSession || !modelMetadata) {
            throw new Error("Model not loaded");
        }

        const userId = candidates[0]?.userId;
        let quizAttemptsCount = 0;
        let averageQuizPercentage = 0;

        if (userId) {
            const attempts = await FormalQuizAttemptModel.find({ userId }).lean().catch(() => []);
            quizAttemptsCount = attempts.length;
            if (quizAttemptsCount > 0) {
                const totalPct = attempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
                averageQuizPercentage = totalPct / quizAttemptsCount;
            }
        }

        const numFeatures = modelMetadata.feature_ordering.length;
        const tensorData = buildFeatureTensor(candidates, context.profile, context.gaps, quizAttemptsCount, averageQuizPercentage);

        const inputTensor = new ort.Tensor("float32", tensorData, [candidates.length, numFeatures]);

        const feeds: Record<string, ort.Tensor> = {};
        feeds[inferenceSession.inputNames[0]] = inputTensor;

        const results = await inferenceSession.run(feeds);

        // Handle onnxmltools classifier conversion outputs
        let scoresArray: any = null;
        let extractScore = (arr: any, idx: number) => arr[idx];

        if (inferenceSession.outputNames.includes("probabilities")) {
            const probTensor = results["probabilities"];
            scoresArray = probTensor.data;
            if (probTensor.type === "float32" && probTensor.data.length === candidates.length * 2) {
                // [P(class0), P(class1), ...]
                extractScore = (arr: any, idx: number) => arr[idx * 2 + 1];
            }
        } else {
            scoresArray = results[inferenceSession.outputNames[0]].data;
        }

        // Map ML scores to candidates and sort
        const ranked = candidates.map((c, idx) => ({
            ...c,
            mlScore: Number(extractScore(scoresArray, idx)) || 0,
            rankingMethod: "xgboost-rank:pairwise",
            modelVersion: modelMetadata.model_version || "synthetic-dev"
        }));

        return ranked.sort((a, b) => b.mlScore - a.mlScore);

    } catch (err: any) {
        // Fallback to deterministic sorting
        return candidates.map(c => ({
            ...c,
            rankingMethod: "deterministic-fallback"
        }));
    }
}
