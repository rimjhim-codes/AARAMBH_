import {
  CompetencyModel,
  CompetencyScoreModel,
  LearningRecommendationModel,
  SkillGapModel,
  EmployeeProfileModel,
  RoleRequirementModel,
  IGOTEnrollmentModel,
  NSSTAEnrollmentModel,
  LearningActivityModel,
  SystemSettingsModel,
  PlatformCourseModel
} from "../models/sih/SihModels";
import { LectureModel } from "../models/Lecture";
import { getIgotProvider } from "./integrations/igot.provider";
import { getNsstaProvider } from "./integrations/nssta.provider";
import { ExternalCourse } from "./integrations/types";
import { generateWithFallback } from "./ai/provider";
import { env } from "../config/env";
import { recalculateSkillGaps } from "./competency.service";
import { rerankCandidatesML } from "./recommendation.ml";

function relevanceScore(course: ExternalCourse, gapName: string, keywords: string[]): number {
  const hay = [
    course.title,
    course.description,
    ...(course.competencies || []),
    ...(course.keywords || [])
  ]
    .join(" ")
    .toLowerCase();
  let score = 0;
  if (hay.includes(gapName.toLowerCase())) score += 40;
  for (const k of keywords) {
    if (k && hay.includes(k.toLowerCase())) score += 10;
  }
  if (course.source === "igot_live" || course.source === "igot_simulated") score += 15;
  if (course.source === "nssta_live" || course.source === "nssta_simulated") score += 15;
  return Math.min(100, score);
}

export type RecommendationScoreInput = {
  course: ExternalCourse;
  gap: any;
  competency: any;
  profile?: any;
  requirements?: any[];
  targetRequirements?: any[];
  score?: any;
  priorTraining?: string[];
  hasRecentActivity?: boolean;
  existingState?: "completed" | "enrolled" | "in_progress";
  weights?: Partial<Record<string, number>>;
};

export const DEFAULT_RECOMMENDATION_WEIGHTS: Record<string, number> = {
  gapAlignment: 1, roleRelevance: 1, departmentRelevance: 1, assignmentRelevance: 1,
  requirementPriority: 1, performanceFit: 1, progressionFit: 1, historyFit: 1,
  sourceFactor: 1, redundancyPenalty: 1
};

export function scoreRecommendationCandidate(input: RecommendationScoreInput) {
  const { course, gap, competency } = input;
  const haystack = [course.title, course.description, ...(course.competencies || []), ...(course.keywords || [])]
    .join(" ").toLowerCase();
  const name = String(competency.name || "").toLowerCase();
  const code = String(competency.code || "").toLowerCase();
  const matchedCompetencies = (course.competencies || []).filter((value) =>
    [name, code, ...(competency.keywords || []).map((k: string) => k.toLowerCase())]
      .some((term) => term && value.toLowerCase().includes(term))
  );
  const roleRequirements = [...(input.requirements || []), ...(input.targetRequirements || [])];
  const roleMatch = roleRequirements.some((r) => String(r.competencyId) === String(gap.competencyId) ||
    String(r.competencyCode || "").toLowerCase() === code);
  const profile = input.profile || {};
  const departmentMatch = roleRequirements.some((r) => r.departmentCode &&
    String(r.departmentCode).toLowerCase() === String(profile.department || "").toLowerCase());
  const assignmentMatch = roleRequirements.some((r) => r.assignment &&
    String(r.assignment).toLowerCase() === String(profile.currentAssignment || "").toLowerCase());
  const evidenceText = (input.score?.evidence || []).map((e: any) => `${e.type} ${e.detail}`).join(" ").toLowerCase();
  const performanceFit = evidenceText ? (/(assessment|quiz|lab|practical)/.test(evidenceText) ? 8 : 2) : 0;
  const difficulty = String(course.difficulty || "").toLowerCase();
  const expected = (Number(gap.currentLevel) || 0) <= 1 ? "beginner" : (Number(gap.currentLevel) || 0) <= 3 ? "intermediate" : "advanced";
  const difficultyFit = difficulty ? (difficulty === expected ? 8 : -2) : 0;
  const prior = (input.priorTraining || []).some((t) => haystack.includes(String(t).toLowerCase()) || String(t).toLowerCase().includes(String(course.title).toLowerCase()));
  const base = relevanceScore(course, competency.name, [competency.name, ...(competency.keywords || [])]);
  const breakdown = {
    baseRelevance: base,
    gapAlignment: Math.min(20, Math.max(0, Number(gap.gap) || 0) * 6),
    roleRelevance: roleMatch ? 12 : 0,
    departmentRelevance: departmentMatch ? 5 : 0,
    assignmentRelevance: assignmentMatch ? 5 : 0,
    requirementPriority: Math.min(8, Math.max(0, Number(roleRequirements.find((r) => String(r.competencyId) === String(gap.competencyId))?.priorityWeight || 0) * 2)),
    performanceFit,
    progressionFit: difficultyFit,
    historyFit: prior ? -12 : (input.hasRecentActivity ? 3 : 0),
    sourceFactor: course.source.includes("live") ? 3 : 0,
    redundancyPenalty: prior ? -12 : 0
  };
  for (const key of Object.keys(breakdown) as Array<keyof typeof breakdown>) {
    const weight = input.weights?.[key] ?? DEFAULT_RECOMMENDATION_WEIGHTS[key] ?? 1;
    breakdown[key] = breakdown[key] * Number(weight);
  }
  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((sum, value) => sum + value, 0)));
  const reasonCodes = ["gap_alignment"];
  if (base > 0) reasonCodes.push("competency_match");
  if (roleMatch) reasonCodes.push("role_requirement");
  if (departmentMatch) reasonCodes.push("department_context");
  if (assignmentMatch) reasonCodes.push("assignment_context");
  if (performanceFit) reasonCodes.push("evidence_performance");
  if (prior) reasonCodes.push("prior_training_overlap");
  if (input.existingState) reasonCodes.push(`existing_${input.existingState}`);
  return { score: Math.round(score), breakdown, matchedCompetencies, reasonCodes, prior, expectedDifficulty: expected };
}

export type RecommendationRefreshScope = {
  competencyIds?: string[];
};

export async function generatePersonalizedLearningPath(userId: string, scope?: RecommendationRefreshScope) {
  const scopedCompetencyIds = [...new Set((scope?.competencyIds || []).map(String).filter(Boolean))];
  const isScoped = scopedCompetencyIds.length > 0;
  const gaps = await SkillGapModel.find({
    userId,
    gap: { $gt: 0 },
    ...(isScoped ? { competencyId: { $in: scopedCompetencyIds } } : {})
  })
    .sort({ gap: -1 })
    .limit(8)
    .lean();

  if (!gaps.length) {
    await LearningRecommendationModel.deleteMany({
      userId,
      status: "recommended",
      ...(isScoped ? { competencyId: { $in: scopedCompetencyIds } } : {})
    });
    return [];
  }

  const comps = await CompetencyModel.find({
    _id: { $in: gaps.map((g) => g.competencyId) }
  }).lean();
  const byId = new Map(comps.map((c) => [String(c._id), c]));
  const profile = await EmployeeProfileModel.findOne({ userId }).lean().catch(() => null);
  const requirements = profile?.jobRole
    ? await RoleRequirementModel.find({ jobRole: profile.jobRole }).lean().catch(() => [])
    : [];
  const recommendationSetting = await SystemSettingsModel.findOne({ key: "recommendation_weights" }).lean().catch(() => null);
  const recommendationWeights = recommendationSetting?.value && typeof recommendationSetting.value === "object"
    ? recommendationSetting.value as Partial<Record<string, number>>
    : undefined;
  const targetRequirements = profile?.desiredCareerRole
    ? await RoleRequirementModel.find({ jobRole: profile.desiredCareerRole }).lean().catch(() => [])
    : [];
  const scores = await CompetencyScoreModel.find({ userId, competencyId: { $in: gaps.map((g) => g.competencyId) } }).lean().catch(() => []);
  const scoreById = new Map(scores.map((s) => [String(s.competencyId), s]));
  const [priorRecommendations, igotEnrollments, nsstaEnrollments, recentActivity, allCatalogCourses, allLectures] = await Promise.all([
    LearningRecommendationModel.find({ userId, status: { $in: ["completed", "enrolled", "in_progress"] } }).lean().catch(() => []),
    IGOTEnrollmentModel.find({ userId }).lean().catch(() => []),
    NSSTAEnrollmentModel.find({ userId }).lean().catch(() => []),
    LearningActivityModel.findOne({ userId }).sort({ occurredAt: -1 }).lean().catch(() => null),
    PlatformCourseModel.find({ catalogType: "platform", isActive: true })
      .select("code title description provider difficulty durationHours competencyCodes keywords courseUrl")
      .lean()
      .catch(() => []),
    LectureModel.find({ userId }).select("_id title durationSec").lean().catch(() => [])
  ]);
  const existingByCourse = new Map<string, string>();
  [...priorRecommendations, ...igotEnrollments.map((e) => ({ externalId: e.courseId, status: e.status })), ...nsstaEnrollments.map((e) => ({ externalId: e.programmeId, status: e.status }))]
    .forEach((item: any) => existingByCourse.set(String(item.externalId), item.status));

  const igot = getIgotProvider();
  const nssta = getNsstaProvider();

  const recommendations: Array<Record<string, unknown>> = [];
  let pathStep = 1;

  for (const gap of gaps) {
    const comp = byId.get(String(gap.competencyId));
    if (!comp) continue;

    const keywords = [comp.name, ...(comp.keywords || [])].map((k) => k.toLowerCase()).filter(Boolean);
    const searchTerms = keywords;
    
    // In-memory catalog search
    const scoredCatalog = allCatalogCourses
      .map((c: any) => {
        const hay = [c.title, c.description, ...(c.competencyCodes || []), ...(c.keywords || [])].join(" ").toLowerCase();
        const hits = searchTerms.length ? searchTerms.filter((t) => hay.includes(t)).length : 1;
        return { c, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 20)
      .map(({ c }) => ({
        id: String(c.code),
        title: c.title,
        description: c.description || "",
        provider: c.provider || "ARAMBH Platform Catalog",
        difficulty: c.difficulty,
        durationHours: c.durationHours,
        competencies: c.competencyCodes || [],
        keywords: c.keywords || [],
        url: c.courseUrl ? String(c.courseUrl) : `/platform-courses/${c.code}`,
        source: "platform_catalog" as const
      }));

    const compNamePrefix = comp.name.split(" ")[0].toLowerCase();
    const lectures = allLectures.filter((l: any) => String(l.title || "").toLowerCase().includes(compNamePrefix)).slice(0, 3);

    const igotCourses = igot.name === "platform_catalog" 
      ? scoredCatalog.slice(0, 5)
      : await igot.searchCourses({ competencyNames: [comp.name], keywords, limit: 5 }).catch(() => []);
      
    const nsstaCourses = nssta.name === "platform_catalog"
      ? scoredCatalog.slice(0, 5)
      : await nssta.searchCourses({ competencyNames: [comp.name], keywords, limit: 5 }).catch(() => []);
      
    const catalogCourses = scoredCatalog;

    const ranked = [...igotCourses, ...nsstaCourses, ...catalogCourses]
      .map((c) => ({ c, result: scoreRecommendationCandidate({
        course: c,
        gap,
        competency: comp,
        profile,
        requirements: requirements.filter((r: any) => String(r.competencyId) === String(gap.competencyId)),
        targetRequirements: targetRequirements.filter((r: any) => String(r.competencyId) === String(gap.competencyId)),
        score: scoreById.get(String(gap.competencyId)),
        priorTraining: profile?.previousTrainings || [],
        hasRecentActivity: Boolean(recentActivity),
        existingState: existingByCourse.get(c.id) as any,
        weights: recommendationWeights
      }) }))
      .filter(({ c }) => !["completed", "dismissed"].includes(existingByCourse.get(c.id) || ""))
      .sort((a, b) => b.result.score - a.result.score);

    for (const { c, result } of ranked.slice(0, 2)) {
      const source =
        c.source === "igot_live" || c.source === "igot_simulated"
          ? "igot"
          : c.source === "nssta_live" || c.source === "nssta_simulated"
            ? "nssta"
            : c.provider.toLowerCase().includes("tpac") || c.id.startsWith("NSSTA")
              ? "nssta"
              : c.source === "platform_catalog"
                ? "platform"
                : "platform";

      recommendations.push({
        userId,
        competencyId: gap.competencyId,
        source,
        externalId: c.id,
        title: c.title,
        description: c.description,
        provider: c.provider,
        difficulty: c.difficulty || "",
        durationHours: c.durationHours || 0,
        relevanceScore: result.score,
        confidence: gap.confidence || "low",
        reasonCodes: result.reasonCodes,
        reasonSummary: `Addresses the ${gap.priority} ${comp.name} gap using ${result.reasonCodes.join(", ")}.`,
        matchedCompetencies: result.matchedCompetencies,
        solvedGaps: [String(gap.competencyId)],
        personalizationFactors: [profile?.jobRole, profile?.department, profile?.currentAssignment, profile?.desiredCareerRole, `confidence:${gap.confidence || "low"}`].filter(Boolean),
        evidence: (scoreById.get(String(gap.competencyId))?.evidence || []).map((e: any) => `${e.type}: ${e.detail}`),
        scoreBreakdown: result.breakdown,
        whyRecommended: `Matches the ${gap.priority} skill gap in ${comp.name} (gap=${gap.gap})${result.reasonCodes.includes("role_requirement") ? " and the learner's role requirement" : ""}.`,
        gapSolved: `${comp.name}: ${gap.currentLevel} → ${gap.requiredLevel}`,
        expectedImprovement: `Expected to progress toward level ${Math.min(5, gap.currentLevel + 1)} after completion and reassessment.`,
        priority: gap.gap * 10 + (gap.priority === "critical" ? 5 : 0) + (result.score / 100),
        courseUrl: c.url || "",
        pathStep: pathStep++,
        status: "recommended"
      });
    }

    for (const lec of lectures) {
      recommendations.push({
        userId,
        competencyId: gap.competencyId,
        source: "internal_lecture",
        externalId: String(lec._id),
        title: lec.title,
        description: "Internal AARAMBH lecture already in your workspace.",
        provider: "AARAMBH",
        difficulty: "",
        durationHours: Math.round((lec.durationSec || 0) / 3600) || 1,
        relevanceScore: 70 + (profile?.currentAssignment ? 2 : 0),
        reasonCodes: ["internal_lecture", "gap_alignment"],
        reasonSummary: `Existing internal learning content mapped to the ${comp.name} gap.`,
        matchedCompetencies: [comp.name],
        solvedGaps: [String(gap.competencyId)],
        personalizationFactors: profile?.jobRole ? [profile.jobRole] : [],
        evidence: [],
        scoreBreakdown: { baseRelevance: 70, gapAlignment: gap.gap * 6 },
        whyRecommended: `Your uploaded/imported lecture relates to ${comp.name}.`,
        gapSolved: `${comp.name} gap`,
        expectedImprovement: "Supports revision and quiz practice on this competency.",
        priority: gap.gap * 8,
        courseUrl: `/player?lectureId=${lec._id}`,
        pathStep: pathStep++,
        status: "recommended"
      });
    }

    // Structured path steps when few external matches
    if (ranked.length === 0) {
      recommendations.push({
        userId,
        competencyId: gap.competencyId,
        source: "platform",
        externalId: `PATH_${comp.code}_FOUNDATION`,
        title: `${comp.name}: Foundation Module`,
        description: `Start with foundational concepts for ${comp.name}, then practice and reassess.`,
        provider: "AARAMBH Learning Path",
        difficulty: "beginner",
        durationHours: 6,
        relevanceScore: 60,
        reasonCodes: ["gap_alignment", "local_fallback"],
        reasonSummary: `Local foundation fallback because no external catalogue match was available for ${comp.name}.`,
        matchedCompetencies: [comp.name],
        solvedGaps: [String(gap.competencyId)],
        personalizationFactors: profile?.jobRole ? [profile.jobRole] : [],
        evidence: [],
        scoreBreakdown: { baseRelevance: 60, gapAlignment: gap.gap * 6 },
        whyRecommended: `No external catalogue match yet; generated learning-path step for ${comp.name}.`,
        gapSolved: `${comp.name}: ${gap.currentLevel} → ${gap.requiredLevel}`,
        expectedImprovement: `Move from level ${gap.currentLevel} toward ${gap.requiredLevel}.`,
        priority: gap.gap * 10,
        courseUrl: "",
        pathStep: pathStep++,
        status: "recommended"
      });
    }
  }

  await LearningRecommendationModel.deleteMany({
    userId,
    status: "recommended",
    ...(isScoped ? { competencyId: { $in: scopedCompetencyIds } } : {})
  });
  let finalRecommendations = recommendations;
  if (recommendations.length) {
    // Attempt ML re-ranking hook (Fallback will be applied if ML unavailable)
    finalRecommendations = await rerankCandidatesML(recommendations, { profile, gaps });
    
    // Reassign pathStep correctly after ML ranking order is finalized
    finalRecommendations.forEach((rec, index) => {
      rec.pathStep = index + 1;
    });

    await LearningRecommendationModel.insertMany(finalRecommendations);
  }

  return LearningRecommendationModel.find({ userId }).sort({ priority: -1, pathStep: 1 }).lean();
}

/**
 * Read-only verification fallback for a clean local demo environment.
 * These are catalog resources, not personalized recommendations and do not
 * claim to address a persisted competency gap.
 */
export async function getDemoLearningPathFallback() {
  if (!env.demoMode) return [];

  const courses = await PlatformCourseModel.find({
    provider: "ARAMBH Demo Catalog",
    catalogType: "platform",
    isActive: true
  })
    .select("code title description provider difficulty durationHours courseUrl")
    .limit(4)
    .lean();

  return courses.map((course: any, index: number) => ({
    _id: `demo-catalog-${course.code}`,
    pathStep: index + 1,
    source: "platform",
    externalId: String(course.code),
    title: course.title,
    description: course.description || "",
    provider: course.provider,
    difficulty: course.difficulty || "",
    durationHours: course.durationHours || 0,
    courseUrl: course.courseUrl || `/platform-courses/${course.code}`,
    status: "available",
    confidence: "context_only",
    reasonCodes: ["demo_catalog"],
    reasonSummary: "ARAMBH Demo Learning Resource for local flow verification; not personalized to a competency gap.",
    matchedCompetencies: [],
    solvedGaps: [],
    personalizationFactors: [],
    demoResource: true
  }));
}

export async function explainRecommendationWithAi(userId: string, recommendationId: string) {
  const rec = await LearningRecommendationModel.findOne({ _id: recommendationId, userId }).lean();
  if (!rec) return null;
  try {
    const { text, provider } = await generateWithFallback({
      task: "recommendation",
      temperature: 0.3,
      prompt:
        "Explain in 4 short bullets why this course helps an official statistics learner.\n" +
        "Do not invent enrollment or completion facts.\n" +
        `Title: ${rec.title}\nProvider: ${rec.provider}\nGap: ${rec.gapSolved}\nWhy: ${rec.whyRecommended}`
    }, userId);
    return { explanation: text, provider, recommendation: rec };
  } catch (e) {
    return {
      explanation: rec.whyRecommended,
      provider: "none",
      error: (e as Error).message,
      recommendation: rec
    };
  }
}

export async function syncTrainingCompletion(input: {
  userId: string;
  source: "igot" | "nssta";
  externalId: string;
  completed: boolean;
  refreshSkillGaps?: boolean;
}) {
  const recommendation = await LearningRecommendationModel.findOne({
    userId: input.userId,
    source: input.source,
    externalId: input.externalId
  }).lean();
  if (input.completed && recommendation) {
    await LearningRecommendationModel.updateOne(
      { _id: recommendation._id, userId: input.userId },
      { $set: { status: "completed" } }
    );
  }

  const skillGaps = input.completed && input.refreshSkillGaps !== false
    ? await recalculateSkillGaps(input.userId)
    : [];
  return {
    // Completion, recommendation mappings, and catalogue mappings are
    // contextual signals only. Competency evidence must come from an
    // explicit validated assessment/practical evidence flow.
    competencyUpdated: false,
    skillGapsUpdated: true,
    skillGapCount: skillGaps.length
  };
}
