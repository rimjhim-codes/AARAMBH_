import { UserModel } from "../models/User";
import {
  CompetencyScoreModel,
  FormalQuizAttemptModel,
  IGOTEnrollmentModel,
  LearningActivityModel,
  NSSTAEnrollmentModel,
  PerformanceSnapshotModel,
  SystemSettingsModel
} from "../models/sih/SihModels";

type Weights = {
  courseCompletion: number;
  assessmentPerformance: number;
  competencyAchievement: number;
  trainingCompletion: number;
  quizPerformance: number;
  learningHoursScore: number;
};

const DEFAULT_WEIGHTS: Weights = {
  courseCompletion: 0.2,
  assessmentPerformance: 0.25,
  competencyAchievement: 0.25,
  trainingCompletion: 0.1,
  quizPerformance: 0.15,
  learningHoursScore: 0.05
};

export async function getLearningWeights(): Promise<Weights> {
  const doc = await SystemSettingsModel.findOne({ key: "learning_percentage_weights" }).lean();
  if (!doc?.value || typeof doc.value !== "object") return DEFAULT_WEIGHTS;
  return { ...DEFAULT_WEIGHTS, ...(doc.value as Weights) };
}

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function recalculatePerformance(userId: string) {
  const weights = await getLearningWeights();
  const [user, quizAttempts, igot, nssta, scores, activities] = await Promise.all([
    UserModel.findById(userId).lean(),
    FormalQuizAttemptModel.find({ userId }).lean(),
    IGOTEnrollmentModel.find({ userId }).lean(),
    NSSTAEnrollmentModel.find({ userId }).lean(),
    CompetencyScoreModel.find({ userId }).lean(),
    LearningActivityModel.find({ userId }).lean()
  ]);

  const quizAttemptsCount = quizAttempts.length;
  const quizAveragePercentage = quizAttemptsCount
    ? quizAttempts.reduce((s, a) => s + a.percentage, 0) / quizAttemptsCount
    : 0;

  const totalAnswers = quizAttempts.reduce(
    (s, a) => s + a.correctCount + a.incorrectCount + a.skippedCount,
    0
  );
  const correctAnswers = quizAttempts.reduce((s, a) => s + a.correctCount, 0);
  const accuracy = totalAnswers ? (correctAnswers / totalAnswers) * 100 : 0;

  const coursesCompleted = igot.filter((c) => c.status === "completed").length;
  const coursesInProgress = igot.filter((c) => c.status === "in_progress" || c.status === "enrolled")
    .length;
  const trainingCompleted = nssta.filter((c) => c.status === "completed").length;
  const trainingTotal = nssta.length;

  const learningHoursFromUser = (user?.minutesStudiedTotal || 0) / 60;
  const learningHoursFromActivity =
    activities.reduce((s, a) => s + (a.minutes || 0), 0) / 60;
  const learningHours = Math.max(learningHoursFromUser, learningHoursFromActivity);

  const competencyAchievement =
    scores.length === 0
      ? 0
      : (scores.reduce((s, c) => {
          const target = Math.max(1, c.targetLevel || 3);
          return s + Math.min(1, (c.currentLevel || 0) / target);
        }, 0) /
          scores.length) *
        100;

  const courseCompletionPct =
    igot.length === 0 ? 0 : (coursesCompleted / igot.length) * 100;
  const trainingCompletionPct =
    trainingTotal === 0 ? 0 : (trainingCompleted / trainingTotal) * 100;
  const learningHoursScore = clampPct((learningHours / 40) * 100); // 40h ≈ full score band

  const assessmentPerformance = quizAveragePercentage;
  const quizPerformance = quizAveragePercentage;

  const breakdown = {
    courseCompletion: clampPct(courseCompletionPct),
    assessmentPerformance: clampPct(assessmentPerformance),
    competencyAchievement: clampPct(competencyAchievement),
    trainingCompletion: clampPct(trainingCompletionPct),
    quizPerformance: clampPct(quizPerformance),
    learningHoursScore
  };

  // Only include components that have data; renormalize weights
  const active: Array<keyof Weights> = [];
  if (igot.length) active.push("courseCompletion");
  if (quizAttemptsCount) {
    active.push("assessmentPerformance");
    active.push("quizPerformance");
  }
  if (scores.some((s) => (s.currentLevel || 0) > 0 || s.lastAssessedAt)) {
    active.push("competencyAchievement");
  }
  if (trainingTotal) active.push("trainingCompletion");
  if (learningHours > 0) active.push("learningHoursScore");

  let overall = 0;
  if (active.length === 0) {
    overall = 0;
  } else {
    const weightSum = active.reduce((s, k) => s + (weights[k] || 0), 0) || 1;
    overall = active.reduce((s, k) => s + breakdown[k] * ((weights[k] || 0) / weightSum), 0);
  }

  const snapshot = await PerformanceSnapshotModel.findOneAndUpdate(
    { userId },
    {
      userId,
      quizAttempts: quizAttemptsCount,
      quizAveragePercentage: clampPct(quizAveragePercentage),
      assessmentAverage: clampPct(assessmentPerformance),
      coursesCompleted,
      coursesInProgress,
      trainingCompleted,
      learningHours: Math.round(learningHours * 10) / 10,
      accuracy: clampPct(accuracy),
      competencyAchievementPercent: breakdown.competencyAchievement,
      overallLearningPercent: clampPct(overall),
      breakdown,
      $push: {
        history: {
          $each: [{
            capturedAt: new Date(),
            overallLearningPercent: clampPct(overall),
            competencyAchievementPercent: breakdown.competencyAchievement,
            quizAveragePercentage: clampPct(quizAveragePercentage),
            learningHours: Math.round(learningHours * 10) / 10
          }],
          $slice: -90
        }
      },
      lastCalculatedAt: new Date()
    },
    { upsert: true, new: true }
  );

  return {
    snapshot,
    hasData: active.length > 0,
    activeComponents: active,
    weights,
    emptyReason:
      active.length === 0
        ? "No assessment, enrollment, competency, or learning-hour data available yet."
        : undefined
  };
}

/**
 * Read-only compatibility helper for analytics consumers. The existing
 * /performance/me endpoint intentionally retains its recalculation behavior;
 * foundation analytics must use this helper so reads never write snapshots.
 */
export async function getStoredPerformance(userId: string) {
  return PerformanceSnapshotModel.findOne({ userId }).lean();
}

export async function recordLearningActivity(input: {
  userId: string;
  type:
    | "lecture_watch"
    | "lab"
    | "quiz"
    | "assessment"
    | "course"
    | "training"
    | "tutor"
    | "flashcard"
    | "revision";
  minutes?: number;
  meta?: Record<string, unknown>;
}) {
  await LearningActivityModel.create({
    userId: input.userId,
    type: input.type,
    minutes: input.minutes || 0,
    meta: input.meta,
    occurredAt: new Date()
  });
}
