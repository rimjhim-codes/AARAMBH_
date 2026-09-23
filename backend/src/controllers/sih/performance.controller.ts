import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth";
import { recalculatePerformance } from "../../services/performance.service";
import {
  CompetencyScoreModel,
  FormalQuizAttemptModel,
  LearningActivityModel,
  LearningRecommendationModel,
  PerformanceSnapshotModel,
  SkillGapModel,
  FacultyAssignmentModel,
  CompetencyModel,
  DepartmentModel
} from "../../models/sih/SihModels";
import { UserModel } from "../../models/User";
import { generateWithFallback } from "../../services/ai/provider";
import { EmployeeProfileModel } from "../../models/sih/SihModels";
import { z } from "zod";
import { LANGUAGE_NAMES, languageName, languageTier } from "../../config/languages";

export async function getMyPerformance(req: AuthenticatedRequest, res: Response) {
  const result = await recalculatePerformance(req.user!.id);
  return res.json(result);
}

export async function getEmployeeDashboard(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const [perf, gaps, recs, attempts, scores, user, activities] = await Promise.all([
    recalculatePerformance(userId),
    SkillGapModel.find({ userId }).populate("competencyId").sort({ gap: -1 }).limit(10).lean(),
    LearningRecommendationModel.find({ userId }).sort({ priority: -1 }).limit(10).lean(),
    FormalQuizAttemptModel.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    CompetencyScoreModel.find({ userId }).populate("competencyId").lean(),
    UserModel.findById(userId).select("studyStreak xp minutesStudiedTotal watchSecondsTotal").lean(),
    LearningActivityModel.find({ userId }).sort({ occurredAt: -1 }).limit(15).lean()
  ]);

  return res.json({
    performance: perf,
    skillGaps: gaps,
    recommendations: recs,
    recentAttempts: attempts,
    competencies: scores,
    userStats: user,
    recentActivity: activities
  });
}

export async function getEmployeeAnalytics(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90);
  const activities = await LearningActivityModel.find({
    userId,
    occurredAt: { $gte: since }
  }).lean();

  const byDay: Record<string, number> = {};
  for (const a of activities) {
    const key = new Date(a.occurredAt).toISOString().slice(0, 10);
    byDay[key] = (byDay[key] || 0) + (a.minutes || 0);
  }

  const attempts = await FormalQuizAttemptModel.find({ userId }).sort({ createdAt: 1 }).lean();
  const scores = await CompetencyScoreModel.find({ userId }).populate("competencyId").lean();
  const perf = await PerformanceSnapshotModel.findOne({ userId }).lean();

  return res.json({
    activityByDay: Object.entries(byDay).map(([date, minutes]) => ({ date, minutes })),
    quizTrend: attempts.map((a) => ({
      date: a.createdAt,
      percentage: a.percentage,
      passed: a.passed
    })),
    competencyTrend: scores.map((s) => ({
      competency: (s.competencyId as any)?.name || String(s.competencyId),
      history: s.history || [],
      currentLevel: s.currentLevel,
      targetLevel: s.targetLevel
    })),
    performance: perf,
    empty:
      activities.length === 0 && attempts.length === 0 && scores.every((s) => !s.lastAssessedAt),
    message:
      activities.length === 0 && attempts.length === 0
        ? "No analytics data yet. Take assessments or study to populate charts."
        : undefined
  });
}

export async function predictiveAnalytics(req: AuthenticatedRequest, res: Response) {
  const gaps = await SkillGapModel.find({ gap: { $gte: 2 } })
    .populate("competencyId")
    .lean();
  const snapshots = await PerformanceSnapshotModel.find({ "history.1": { $exists: true } }).lean();

  if (snapshots.length === 0) {
    return res.json({
      status: "insufficient_data",
      message: "Insufficient PerformanceSnapshot history. Forecasting starts after at least two stored snapshots per learner.",
      predictions: [],
      method: "historical_performance_trend"
    });
  }

  const metrics = [
    "overallLearningPercent",
    "competencyAchievementPercent",
    "quizAveragePercentage",
    "learningHours"
  ] as const;
  const predictions = metrics.map((metric) => {
    let currentTotal = 0;
    let slopeTotal = 0;
    let count = 0;
    for (const snapshot of snapshots) {
      const points = (snapshot.history || []).slice().sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
      if (points.length < 2) continue;
      const first = points[0];
      const last = points[points.length - 1];
      const days = Math.max(1 / 24, (new Date(last.capturedAt).getTime() - new Date(first.capturedAt).getTime()) / 86400000);
      currentTotal += Number(last[metric] || 0);
      slopeTotal += (Number(last[metric] || 0) - Number(first[metric] || 0)) / days;
      count += 1;
    }
    const currentAverage = currentTotal / Math.max(1, count);
    const dailyChange = slopeTotal / Math.max(1, count);
    const projected30Day = metric === "learningHours"
      ? Math.max(0, currentAverage + dailyChange * 30)
      : Math.max(0, Math.min(100, currentAverage + dailyChange * 30));
    return {
      metric,
      learnersIncluded: count,
      currentAverage: Math.round(currentAverage * 10) / 10,
      dailyChange: Math.round(dailyChange * 100) / 100,
      projected30Day: Math.round(projected30Day * 10) / 10,
      outlook: dailyChange > 0.01 ? "improving" : dailyChange < -0.01 ? "declining" : "stable"
    };
  });

  return res.json({
    status: "ok",
    method: "historical_performance_trend",
    horizonDays: 30,
    predictions,
    highPriorityGaps: gaps.length,
    note: "Forecasts use linear change between each learner's earliest and latest stored PerformanceSnapshot history points; they are not AI-generated predictions."
  });
}

export async function aiAssistant(req: AuthenticatedRequest, res: Response) {
  const question = z.string().min(3).parse(req.body?.question);
  const requestedLanguage = z.enum(LANGUAGE_NAMES).optional().parse(req.body?.language);
  const userId = req.user!.id;
  const role = req.user!.role || "employee";

  let context = "";
  let responseLanguage = "English";
  let responseTier = 1;
  let profile = null;

  if (role === "admin") {
    const gaps = await SkillGapModel.aggregate([
      { $group: { _id: { competencyId: "$competencyId", priority: "$priority" }, count: { $sum: 1 }, avgGap: { $avg: "$gap" } } },
      { $sort: { avgGap: -1 } },
      { $limit: 10 }
    ]);
    const compIds = gaps.map((g) => g._id.competencyId);
    const comps = await CompetencyModel.find({ _id: { $in: compIds } }).lean();
    const nameById = new Map(comps.map((c) => [String(c._id), c.name]));

    context = `Admin / Organization context:\nTop organization-wide competency gaps:\n` +
      gaps.map(g => `${nameById.get(String(g._id.competencyId)) || "Unknown"}: avg gap ${g.avgGap.toFixed(1)}`).join("\n") + "\n";

    responseLanguage = languageName(requestedLanguage || "en");
    responseTier = languageTier(responseLanguage);
  } else if (role === "faculty") {
    const assignments = await FacultyAssignmentModel.find({ facultyId: userId }).lean();
    const learnerIds = assignments.map((a) => (a.learnerId as any)._id || a.learnerId);

    const gaps = await SkillGapModel.aggregate([
      { $match: { userId: { $in: learnerIds } } },
      { $group: { _id: "$competencyId", avgGap: { $avg: "$gap" } } },
      { $sort: { avgGap: -1 } },
      { $limit: 10 }
    ]);
    const compIds = gaps.map((g) => g._id);
    const comps = await CompetencyModel.find({ _id: { $in: compIds } }).lean();
    const nameById = new Map(comps.map((c) => [String(c._id), c.name]));

    context = `Faculty context (Assigned Learners: ${learnerIds.length}):\nTop competency gaps among your learners:\n` +
      gaps.map(g => `${nameById.get(String(g._id)) || "Unknown"}: avg gap ${g.avgGap.toFixed(1)}`).join("\n") + "\n";

    responseLanguage = languageName(requestedLanguage || "en");
    responseTier = languageTier(responseLanguage);
  } else {
    // Employee
    const [empProfile, gaps, recs, perf] = await Promise.all([
      EmployeeProfileModel.findOne({ userId }).lean(),
      SkillGapModel.find({ userId }).populate("competencyId").sort({ gap: -1 }).limit(5).lean(),
      LearningRecommendationModel.find({ userId }).sort({ priority: -1 }).limit(5).lean(),
      PerformanceSnapshotModel.findOne({ userId }).lean()
    ]);
    profile = empProfile;
    responseLanguage = languageName(requestedLanguage || profile?.languagePreference);
    responseTier = languageTier(responseLanguage);

    context =
      `Learner profile:\n${JSON.stringify({
        jobRole: profile?.jobRole,
        department: profile?.department,
        experience: profile?.yearsOfExperience,
        skills: profile?.currentSkills
      })}\n` +
      `Top skill gaps:\n${gaps
        .map(
          (g) =>
            `${(g.competencyId as any)?.name}: current ${g.currentLevel}, required ${g.requiredLevel}, gap ${g.gap}`
        )
        .join("\n")}\n` +
      `Top recommendations:\n${recs.map((r) => `${r.title} (${r.source}) — ${r.whyRecommended}`).join("\n")}\n` +
      `Performance:\n${JSON.stringify(perf?.breakdown || {})}\nOverall: ${perf?.overallLearningPercent ?? "n/a"}%\n`;
  }
    console.log("[AI Assistant] request received", {
      userId: Boolean(req.user?.id),
      role: req.user?.role,
      questionLength: typeof req.body?.question === "string" ? req.body.question.length : null,
      language: req.body?.language
    });
    
    const promptPayload = "You are AARAMBH AI Virtual Assistant for India's Official Statistical System.\n" +
      `Current user role: ${role}.\n` +
      "Answer using ONLY the provided context. If data is missing, say so.\n" +
      (role === "admin" ? "You are assisting an administrator. Provide workforce capability and training insights.\n" :
       role === "faculty" ? "You are assisting a faculty member. Prioritize learner development, teaching, and training content. Do not provide information outside their authorized learner scope.\n" :
       "You are assisting an employee learner. Focus on their personal skill development.\n") +
      `Respond ONLY in ${responseLanguage}. Do not infer or switch languages based on the question. Use the requested language's natural script where applicable.\n` +
      (responseTier === 2 ? "This is a limited-quality beta language; keep the response clear and concise.\n" : "") +
      "Do not invent iGOT enrollments or scores.\n\n" +
      `${context}\nQuestion: ${question}`;
      
    console.log("[AI Assistant] about to call generateWithFallback", { promptLength: promptPayload.length });

    try {
      const { text, provider } = await generateWithFallback(
      {
        task: "tutor",
        temperature: 0.35,
        prompt: promptPayload
      },
      userId
    );
    console.log("[AI Assistant] generateWithFallback returned", { provider });
    const clearlyBroken = responseTier === 2 && (!text.trim() || text.includes("") || /(?:\?\s*){8,}/.test(text));
    if (clearlyBroken && responseLanguage !== "English") {
      const fallback = await generateWithFallback({
        task: "tutor",
        temperature: 0.2,
        prompt: "Respond ONLY in English. The requested beta-language output was unusable. Give a concise answer using ONLY this context.\n\n" + `${context}\nQuestion: ${question}`
      }, userId);
      return res.json({ answer: fallback.text, provider: fallback.provider, responseLanguage: "English", qualityFallback: true });
    }
    return res.json({ answer: text, provider, responseLanguage, languageTier: responseTier });
  } catch (e) {
    const error = e as { message?: string; provider?: string; code?: string; failures?: Array<{ provider: string; status: string }> };
    console.error("[AI Assistant] provider failure", {
      provider: error.provider,
      code: error.code,
      failures: error.failures
    });
    return res.status(503).json({
      code: "AI_UNAVAILABLE",
      message: "AI is temporarily unavailable. No response was fabricated.",
      status: error.code || "provider_unavailable",
      provider: error.provider || "all",
      failures: error.failures || [],
      answer: null
    });
  }
}
