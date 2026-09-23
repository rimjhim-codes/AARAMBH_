import {
  CompetencyModel,
  CompetencyScoreModel,
  EmployeeProfileModel,
  GapPriority,
  RoleRequirementModel,
  SkillGapModel
} from "../models/sih/SihModels";
import { LEGACY_FRAMEWORK_ID, LEGACY_FRAMEWORK_VERSION } from "./framework.service";

export type CompetencyEvidence = { type?: string | null; detail?: string | null; scoreImpact?: number | null; key?: string | null; at?: Date | string | null };

const FRESHNESS_WINDOW_MS = 365 * 24 * 60 * 60 * 1000; // 12-month freshness window
const STALE_THRESHOLD_MS = 730 * 24 * 60 * 60 * 1000; // 24-month stale threshold

export function confidenceFromEvidence(evidence: ReadonlyArray<CompetencyEvidence> = []) {
  const types = new Set(evidence.map((item) => item.type).filter(Boolean));
  const verifiedTypes = ["assessment", "quiz", "lab", "faculty"];
  const verified = verifiedTypes.filter((type) => types.has(type)).length;
  const learning = ["course", "training", "activity"].some((type) => types.has(type));
  
  let base: "high" | "medium" | "low" = "low";
  if (verified >= 2) base = "high";
  else if (verified >= 1 && (learning || types.has("profile"))) base = "medium";
  
  if (base === "low") return "low";

  const now = Date.now();
  let newestVerifiedAgeMs = Infinity;

  for (const item of evidence) {
    if (item.type && verifiedTypes.includes(item.type)) {
      if (!item.at) {
        newestVerifiedAgeMs = 0; // missing `at` is treated as legacy/fresh
        continue;
      }
      const itemDate = new Date(item.at).getTime();
      if (isNaN(itemDate)) {
        newestVerifiedAgeMs = 0; // invalid `at` is treated as legacy/fresh
        continue;
      }
      const age = Math.max(0, now - itemDate);
      if (age < newestVerifiedAgeMs) {
        newestVerifiedAgeMs = age;
      }
    }
  }

  if (newestVerifiedAgeMs <= FRESHNESS_WINDOW_MS) {
    return base;
  }
  if (newestVerifiedAgeMs <= STALE_THRESHOLD_MS) {
    // AGING: confidence degrades by one tier
    return base === "high" ? "medium" : "low";
  }
  
  // STALE: stale evidence alone must not support HIGH confidence.
  return "low";
}

export function summarizeEvidence(evidence: ReadonlyArray<CompetencyEvidence> = []) {
  const seen = new Set<string>();
  return evidence
    .filter((item) => item.type && !seen.has(item.type) && seen.add(item.type))
    .map((item) => item.detail ? `${item.type}: ${item.detail}` : String(item.type))
    .join("; ");
}

/** Backward-compatible assessment bands used by the existing assessment flow. */
export function levelFromAssessmentAccuracy(accuracy: number) {
  if (accuracy >= 90) return 5;
  if (accuracy >= 75) return 4;
  if (accuracy >= 60) return 3;
  if (accuracy >= 40) return 2;
  if (accuracy > 0) return 1;
  return 0;
}

function requirementSpecificity(requirement: any, profile: { department?: string; currentAssignment?: string }) {
  const exactDepartment = Boolean(requirement.departmentCode && requirement.departmentCode === profile.department);
  const exactAssignment = Boolean(requirement.assignment && requirement.assignment === profile.currentAssignment);
  return exactDepartment && exactAssignment ? 4 : exactDepartment ? 3 : exactAssignment ? 2 : 1;
}

function requirementVersionRank(requirement: any) {
  const status = requirement.frameworkVersionId?.status;
  return status === "published" ? 5 : status === "approved" ? 4 : status === "review" ? 3 : status === "draft" ? 2 : requirement.frameworkId ? 1 : 0;
}

function isRequirementEffective(requirement: any, now = new Date()) {
  return (!requirement.effectiveFrom || requirement.effectiveFrom <= now)
    && (!requirement.effectiveTo || requirement.effectiveTo >= now)
    && requirement.frameworkVersionId?.status !== "retired";
}

async function requirementsForProfile(profile: { jobRole?: string; department?: string; currentAssignment?: string }) {
  if (!profile.jobRole) return [];
  const requirements = await RoleRequirementModel.find({
    jobRole: profile.jobRole,
    $or: [{ roleContext: "current" }, { roleContext: { $exists: false } }]
  }).populate("frameworkVersionId", "status").lean();
  const applicable = requirements.filter((requirement) => {
    const departmentMatches = !requirement.departmentCode || requirement.departmentCode === profile.department;
    const assignmentMatches = !requirement.assignment || requirement.assignment === profile.currentAssignment;
    return departmentMatches && assignmentMatches && isRequirementEffective(requirement);
  });
  const bestByCompetency = new Map<string, any>();
  for (const requirement of applicable) {
    const key = String(requirement.competencyId);
    const current = bestByCompetency.get(key);
    const score = [requirementSpecificity(requirement, profile), requirementVersionRank(requirement)];
    const currentScore = current ? [requirementSpecificity(current, profile), requirementVersionRank(current)] : [-1, -1];
    if (!current || score[0] > currentScore[0] || (score[0] === currentScore[0] && score[1] > currentScore[1])) bestByCompetency.set(key, requirement);
  }
  return [...bestByCompetency.values()];
}

export async function requirementsForCareerRole(role: string) {
  if (!role) return [];
  return RoleRequirementModel.find({
    jobRole: role,
    roleContext: { $in: ["career", "current"] }
  }).populate("frameworkVersionId", "status").lean().then((items) => items.filter((item) => isRequirementEffective(item)));
}

export function classifyGap(gap: number): GapPriority {
  if (gap <= 0) return "none";
  if (gap === 1) return "low";
  if (gap === 2) return "medium";
  if (gap === 3) return "high";
  return "critical";
}

export function actionForGap(priority: GapPriority, competencyName: string): string {
  switch (priority) {
    case "none":
      return `Maintain ${competencyName} through practice and periodic reassessment.`;
    case "low":
      return `Complete a short refresher module on ${competencyName}.`;
    case "medium":
      return `Follow a structured learning path for ${competencyName} and take an assessment.`;
    case "high":
      return `Prioritize foundational + intermediate training for ${competencyName} this quarter.`;
    case "critical":
      return `Immediate capacity-building required for ${competencyName}; enroll in intensive programme.`;
  }
}

/** Returns null when no mapped role/career requirement exists; never invents level 3. */
export function requiredLevelForGap(requirement: { requiredLevel?: number } | null | undefined): number | null {
  if (!requirement || !Number.isFinite(requirement.requiredLevel)) return null;
  return Number(requirement.requiredLevel);
}

export function computeProfileCompleteness(profile: Record<string, unknown>): number {
  const fields = [
    "employeeId",
    "department",
    "organization",
    "designation",
    "jobRole",
    "currentAssignment",
    "educationalQualification",
    "degree",
    "specialization",
    "yearsOfExperience",
    "desiredCareerRole"
  ];
  let filled = 0;
  for (const f of fields) {
    const v = profile[f];
    if (typeof v === "number" && v > 0) filled += 1;
    else if (typeof v === "string" && v.trim()) filled += 1;
  }
  const arrays = ["previousTrainings", "certifications", "currentSkills", "futureSkillInterests"];
  for (const f of arrays) {
    const v = profile[f];
    if (Array.isArray(v) && v.length) filled += 1;
  }
  return Math.round((filled / (fields.length + arrays.length)) * 100);
}

/** Infer initial levels from profile skills/trainings keywords — evidence tagged as profile. */
export function inferProfileEvidenceLevel(
  competency: { name: string; keywords?: string[] },
  profile: { currentSkills?: string[]; previousTrainings?: string[]; certifications?: string[] }
) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const name = normalize(competency.name);
  const keywords = (competency.keywords || []).map(normalize).filter(Boolean);
  const current = (profile.currentSkills || []).map(normalize).filter(Boolean);
  const training = [...(profile.previousTrainings || []), ...(profile.certifications || [])].map(normalize).filter(Boolean);
  const matches = (entry: string) => entry === name || entry.includes(name) || keywords.some((keyword) => entry === keyword || entry.includes(keyword));
  const currentMatches = current.filter(matches).length;
  const trainingMatches = training.filter(matches).length;
  // Profile evidence is useful as a starting point, but is unverified and must
  // never claim the full assessed scale. A match in both sources caps at 2.
  if (currentMatches > 0 && trainingMatches > 0) return { level: 2, currentMatches, trainingMatches };
  if (currentMatches > 0) return { level: 2, currentMatches, trainingMatches };
  if (trainingMatches > 0) return { level: 1, currentMatches, trainingMatches };
  return { level: 0, currentMatches, trainingMatches };
}

export async function bootstrapCompetencyScoresFromProfile(userId: string) {
  const profile = await EmployeeProfileModel.findOne({ userId }).lean();
  if (!profile) return [];

  if (process.env.DEBUG_SKILL_GAPS === "true") {
    console.log("[SKILL-GAPS DEBUG] profile fields read by bootstrap", JSON.stringify({
      userId,
      currentSkills: profile.currentSkills,
      previousTrainings: profile.previousTrainings
    }));
  }

  const competencies = await CompetencyModel.find({ isActive: true }).select("_id name keywords").lean();
  const existingScores = await CompetencyScoreModel.find({ userId })
    .select("competencyId currentLevel targetLevel confidenceTier evidence lastAssessedAt")
    .lean();
  const scoreByCompetency = new Map(existingScores.map((score) => [String(score.competencyId), score]));
  const requirements = profile.jobRole
    ? await requirementsForProfile(profile)
    : [];
  const targetByCompetency = new Map(requirements.map((item) => [String(item.competencyId), item.requiredLevel]));

  const results = await Promise.all(competencies.map(async (c) => {
    const existing = scoreByCompetency.get(String(c._id));
    const profileEvidence = inferProfileEvidenceLevel(c, profile);
    const hasAssessedEvidence = existing?.evidence?.some((item) => item.type === "assessment" || item.type === "quiz");
    const hasLabEvidence = existing?.evidence?.some((item) => item.type === "lab");
    const hasVerifiedEvidence = hasAssessedEvidence || hasLabEvidence;
    const level = hasVerifiedEvidence ? existing?.currentLevel || 0 : profileEvidence.level;
    const confidenceTier = hasAssessedEvidence ? "assessed" : hasLabEvidence ? "practical" : "self_reported";
    const evidence = existing?.evidence || [];

    const requirement = requirements.find((item) => String(item.competencyId) === String(c._id));
    const target = targetByCompetency.get(String(c._id)) || existing?.targetLevel || 3;

    const doc = await CompetencyScoreModel.findOneAndUpdate(
      { userId, competencyId: c._id },
      {
        userId,
        competencyId: c._id,
        currentLevel: level,
        confidenceTier,
        confidence: confidenceFromEvidence(evidence),
        targetLevel: target,
        targetLevelSource: requirement ? "role_requirement" : existing?.targetLevelSource || "unmapped",
        frameworkId: requirement?.frameworkId || existing?.frameworkId || LEGACY_FRAMEWORK_ID,
        frameworkVersionId: requirement?.frameworkVersionId?._id || requirement?.frameworkVersionId || existing?.frameworkVersionId,
        frameworkVersion: requirement?.frameworkVersion || existing?.frameworkVersion || LEGACY_FRAMEWORK_VERSION,
        proficiencyScale: existing?.proficiencyScale || "internal_0_5",
        ...(hasAssessedEvidence ? { lastAssessedAt: existing?.lastAssessedAt } : {}),
        ...(evidence.some((item) => item.type === "profile") ? {} : { $push: {
          evidence: {
            type: "profile",
            detail: profileEvidence.level
              ? `Profile evidence matched ${profileEvidence.currentMatches} current skill(s) and ${profileEvidence.trainingMatches} training/certification item(s); baseline level ${profileEvidence.level}.`
              : "No matching profile evidence yet for this competency.",
            scoreImpact: level,
            key: `profile:${String(c._id)}`,
            at: new Date()
          },
          history: { date: new Date(), level, source: "profile" }
        } })
      },
      { upsert: true, new: true, ...(hasAssessedEvidence ? {} : { $unset: { lastAssessedAt: 1 } }) }
    );
    return doc;
  }));
  return results;
}

export async function resolveTargetLevel(userId: string, competencyId: string, jobRole: string) {
  if (jobRole) {
    const req = await RoleRequirementModel.findOne({ jobRole, competencyId }).lean();
    if (req) return req.requiredLevel;
  }
  const existing = await CompetencyScoreModel.findOne({ userId, competencyId }).lean();
  return existing?.targetLevel || 3;
}

export async function updateCompetencyFromAssessment(input: {
  userId: string;
  competencyId: string;
  assessedLevel: number;
  accuracy: number;
  rationale: string;
}) {
  const level = Math.max(0, Math.min(5, Math.round(input.assessedLevel)));
  const target = await resolveTargetLevel(input.userId, input.competencyId, "");
  return CompetencyScoreModel.findOneAndUpdate(
    { userId: input.userId, competencyId: input.competencyId },
    {
      userId: input.userId,
      competencyId: input.competencyId,
      currentLevel: level,
      confidenceTier: "assessed",
      confidence: confidenceFromEvidence([...(await CompetencyScoreModel.findOne({ userId: input.userId, competencyId: input.competencyId }).select("evidence").lean())?.evidence || [], { type: "assessment" }]),
      targetLevel: target,
      targetLevelSource: "unmapped",
      frameworkId: LEGACY_FRAMEWORK_ID,
      frameworkVersion: LEGACY_FRAMEWORK_VERSION,
      proficiencyScale: "internal_0_5",
      lastAssessedAt: new Date(),
      $push: {
        evidence: {
          type: "assessment",
          detail: input.rationale,
          scoreImpact: level,
          at: new Date()
        },
        history: { date: new Date(), level, source: "assessment" }
      }
    },
    { upsert: true, new: true }
  );
}

export async function applyQuizCompetencyImpact(input: {
  userId: string;
  competencyId: string;
  percentage: number;
  topic: string;
  evidenceKey?: string;
}) {
  const existing = await CompetencyScoreModel.findOne({
    userId: input.userId,
    competencyId: input.competencyId
  });
  if (input.evidenceKey && existing?.evidence?.some((item) => item.key === input.evidenceKey)) return existing;
  const prev = existing?.currentLevel || 0;
  let next = prev;
  if (input.percentage >= 85) next = Math.min(5, Math.max(prev, prev + 1 || 2));
  else if (input.percentage >= 70) next = Math.max(prev, Math.min(5, Math.max(1, prev)));
  else if (input.percentage < 50) next = Math.max(0, prev > 0 ? prev - 0 : 0);

  // More precise: map percentage bands to suggested level nudge
  if (input.percentage >= 90) next = Math.min(5, Math.max(prev + 1, 3));
  else if (input.percentage >= 75) next = Math.min(5, Math.max(prev, 2));
  else if (input.percentage >= 60) next = Math.max(prev, 1);
  else if (input.percentage < 40 && prev > 0) next = Math.max(0, prev - 1);

  next = Math.max(0, Math.min(5, Math.round(next)));

  const alreadyInflatedFromTopic = existing?.evidence?.some((e: any) => 
    e.type === "quiz" && 
    typeof e.detail === 'string' && 
    e.detail.includes(`Quiz on "${input.topic}"`) && 
    (e.scoreImpact || 0) > 0
  );

  if (alreadyInflatedFromTopic && next > prev) {
    next = prev;
  }

  return CompetencyScoreModel.findOneAndUpdate(
    { userId: input.userId, competencyId: input.competencyId },
    {
      userId: input.userId,
      competencyId: input.competencyId,
      currentLevel: next,
      confidenceTier: "assessed",
      confidence: confidenceFromEvidence([...(existing?.evidence || []), { type: "quiz" }]),
      lastAssessedAt: new Date(),
      frameworkId: existing?.frameworkId || LEGACY_FRAMEWORK_ID,
      frameworkVersionId: existing?.frameworkVersionId,
      frameworkVersion: existing?.frameworkVersion || LEGACY_FRAMEWORK_VERSION,
      proficiencyScale: existing?.proficiencyScale || "internal_0_5",
      $push: {
        evidence: {
          type: "quiz",
          detail: `Quiz on "${input.topic}" scored ${input.percentage}%. Level ${prev}→${next}.`,
          scoreImpact: next - prev,
          key: input.evidenceKey,
          at: new Date()
        },
        history: { date: new Date(), level: next, source: "quiz" }
      }
    },
    { upsert: true, new: true }
  );
}

export async function applyLabCompetencyImpact(input: {
  userId: string;
  competencyId: string;
  labTitle: string;
  evidenceKey?: string;
}) {
  const existing = await CompetencyScoreModel.findOne({ userId: input.userId, competencyId: input.competencyId });
  const competency = await CompetencyModel.findById(input.competencyId)
    .select("frameworkId frameworkVersionId frameworkVersion proficiencyScale")
    .lean();
  if (input.evidenceKey && existing?.evidence?.some((item) => item.key === input.evidenceKey)) return existing;
  const hasAssessedEvidence = existing?.evidence?.some((item) => item.type === "assessment" || item.type === "quiz");
  const prev = existing?.currentLevel || 0;
  const next = hasAssessedEvidence ? prev : Math.min(3, Math.max(prev, 2));
  return CompetencyScoreModel.findOneAndUpdate(
    { userId: input.userId, competencyId: input.competencyId },
    {
      userId: input.userId,
      competencyId: input.competencyId,
      currentLevel: next,
      ...(hasAssessedEvidence ? {} : { confidenceTier: "practical" }),
      confidence: confidenceFromEvidence([...(existing?.evidence || []), { type: "lab" }]),
      frameworkId: existing?.frameworkId || competency?.frameworkId || LEGACY_FRAMEWORK_ID,
      frameworkVersionId: existing?.frameworkVersionId || competency?.frameworkVersionId,
      frameworkVersion: existing?.frameworkVersion || competency?.frameworkVersion || LEGACY_FRAMEWORK_VERSION,
      proficiencyScale: existing?.proficiencyScale || competency?.proficiencyScale || "internal_0_5",
      $push: {
        evidence: {
          type: "lab",
          detail: `Completed practical lab: ${input.labTitle}.`,
          scoreImpact: next - prev,
          key: input.evidenceKey,
          at: new Date()
        },
        history: { date: new Date(), level: next, source: "lab" }
      }
    },
    { upsert: true, new: true }
  );
}

export type SkillGapRefreshScope = {
  competencyIds?: string[];
};

export async function recalculateSkillGaps(userId: string, scope?: SkillGapRefreshScope) {
  const scopedCompetencyIds = [...new Set((scope?.competencyIds || []).map(String).filter(Boolean))];
  const isScoped = scopedCompetencyIds.length > 0;
  const profile = await EmployeeProfileModel.findOne({ userId }).lean();
  const jobRole = profile?.jobRole || "";
  if (process.env.DEBUG_SKILL_GAPS === "true") {
    console.log("[SKILL-GAPS DEBUG] profile fields read by gap calculation", JSON.stringify({
      userId,
      currentSkills: profile?.currentSkills,
      previousTrainings: profile?.previousTrainings,
      jobRole
    }));
  }
  const [scores, requirements] = await Promise.all([
    CompetencyScoreModel.find({
      userId,
      ...(isScoped ? { competencyId: { $in: scopedCompetencyIds } } : {})
    }).select("competencyId currentLevel targetLevel confidenceTier confidence evidence").lean(),
    profile ? requirementsForProfile(profile) : Promise.resolve([])
  ]);

  const relevantRequirements = isScoped
    ? requirements.filter((r) => scopedCompetencyIds.includes(String(r.competencyId)))
    : requirements;
  const reqMap = new Map(relevantRequirements.map((r) => [String(r.competencyId), r]));

  // If no role requirements, use each score's targetLevel
  const requirementCompIds = relevantRequirements.map((r) => String(r.competencyId));
  const scoreCompIds = scores.map((s) => String(s.competencyId));

  const uniqueIds = [...new Set([...requirementCompIds, ...scoreCompIds])];
  const comps = await CompetencyModel.find({ _id: { $in: uniqueIds } }).select("_id name category").lean();
  const nameById = new Map(comps.map((c) => [String(c._id), c.name]));
  const categoryById = new Map(comps.map((c) => [String(c._id), c.category]));

  const scoreByCompetency = new Map(scores.map((score) => [String(score.competencyId), score]));
  const gapInputs = uniqueIds.map((competencyId) => {
    const score = scoreByCompetency.get(competencyId);
    const currentLevel = score?.currentLevel || 0;
    const requirement = reqMap.get(competencyId);
    
    let requiredLevel = 3;
    if (requirement) {
        const reqLevel = requiredLevelForGap(requirement);
        if (reqLevel != null) requiredLevel = reqLevel;
    } else if (score && score.targetLevel != null) {
        requiredLevel = score.targetLevel;
    }

    const gap = Math.max(0, requiredLevel - currentLevel);
    const priority = classifyGap(gap);
    const name = nameById.get(competencyId) || "Competency";
    return {
      userId,
      competencyId,
      currentLevel,
      confidenceTier: score?.confidenceTier || "self_reported",
      confidence: score?.confidence || confidenceFromEvidence(score?.evidence || []),
      requiredLevel,
      requirementId: requirement?._id || null,
      requirementVersion: requirement?.frameworkVersion || "",
      frameworkId: requirement?.frameworkId || LEGACY_FRAMEWORK_ID,
      frameworkVersionId: requirement?.frameworkVersionId?._id || requirement?.frameworkVersionId || null,
      frameworkVersion: requirement?.frameworkVersion || LEGACY_FRAMEWORK_VERSION,
      proficiencyScale: score?.proficiencyScale || "internal_0_5",
      gap,
      priority,
      recommendedAction: actionForGap(priority, name),
      evidenceSummary: summarizeEvidence(score?.evidence || []),
      domain: categoryById.get(competencyId) || "",
      rationale:
        gap > 0
          ? `Required level ${requiredLevel} for ${jobRole || "role"} vs current ${currentLevel} from stored evidence.`
          : `Current level meets or exceeds required level ${requiredLevel}.`
    };
  });

  await SkillGapModel.deleteMany(isScoped
    ? { userId, competencyId: { $in: uniqueIds } }
    : { userId });
  const gaps = gapInputs.filter(Boolean).length ? await SkillGapModel.insertMany(gapInputs.filter(Boolean) as any[]) : [];

  return gaps.sort((a, b) => b.gap - a.gap || priorityRank(b.priority) - priorityRank(a.priority));
}

function priorityRank(p: GapPriority) {
  return { none: 0, low: 1, medium: 2, high: 3, critical: 4 }[p];
}
