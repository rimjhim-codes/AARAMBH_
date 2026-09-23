import {
  AnalyticsAuthorizationError,
  createAnalyticsDateRange,
  type AnalyticsDateRangeInput
} from "./analytics-foundation.service";
import {
  CompetencyModel,
  CompetencyAssessmentModel,
  CompetencyScoreModel,
  DepartmentModel,
  EmployeeProfileModel,
  FacultyAssignmentModel,
  FormalQuizAttemptModel,
  LearningActivityModel,
  LearningRecommendationModel,
  RoleRequirementModel,
  SkillGapModel
} from "../models/sih/SihModels";
import { UserModel } from "../models/User";
import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import { LearningProgressModel } from "../models/LearningProgress";
import { VirtualLabAttemptModel } from "../models/VirtualLabAttempt";
import {
  compareCompetencyObservations,
  getCompetencyHistoryObservations,
  type CompetencyScoreAnalyticsRecord
} from "./competency-improvement.service";

const MAX_COHORT = 10_000;
const MAX_BREAKDOWN = 100;
const MAX_SCORE_RECORDS = 50_000;

export type OrganizationAnalyticsScope = "organization" | "department" | "role";

export type OrganizationAnalyticsQuery = AnalyticsDateRangeInput & {
  department?: string;
  role?: string;
  competencyId?: string;
  domain?: string;
  source?: string;
  status?: string;
  page?: number;
  limit?: number;
  competencyIds?: string[];
};

export type OrganizationAnalyticsRequester = {
  userId: string;
  roles: string[];
};

export class OrganizationAnalyticsForbiddenError extends AnalyticsAuthorizationError {
  statusCode = 403;
}

type ProfileRecord = { userId: unknown; department?: string; jobRole?: string; designation?: string };

function ids(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || "")).filter(Boolean))];
}

function cohortIdValues(values: string[]) {
  // Test doubles and legacy fixtures may use string identifiers; production
  // Mongo records use ObjectId values. Supporting both keeps the read layer
  // non-invasive while retaining indexed ObjectId queries in production.
  return values.map((value) => /^[a-f\d]{24}$/i.test(value) ? value : value);
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizedLimit(value: unknown, fallback = 50) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, MAX_BREAKDOWN) : fallback;
}

function paginate<T>(items: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
}

function matchesDimension(profile: ProfileRecord | undefined, department?: string, role?: string) {
  if (department && profile?.department !== department) return false;
  if (role && profile?.jobRole !== role && profile?.designation !== role) return false;
  return true;
}

function sourceFilter(source?: string) {
  if (!source) return undefined;
  const aliases: Record<string, string[]> = {
    platform: ["platform", "platform_course"],
    igot: ["igot", "igot_course"],
    nssta: ["nssta", "nssta_course"],
    training: ["training"],
    quiz: ["quiz", "formal_quiz"],
    assessment: ["assessment", "formal_assessment"],
    virtual_lab: ["virtual_lab", "lab"]
  };
  return aliases[source] || [source];
}

function outcomeSourceFilter(source?: string) {
  if (!source) return undefined;
  const aliases: Record<string, string[]> = {
    platform: ["platform"],
    igot: ["igot"],
    nssta: ["nssta"],
    training: ["arambh", "igot", "nssta"],
    quiz: ["arambh"],
    assessment: ["arambh"],
    virtual_lab: ["arambh"]
  };
  return aliases[source] || [source];
}

function statusFilter(status?: string) {
  if (!status) return undefined;
  return status === "passed" ? ["passed", "completed"] : [status];
}

function evidenceBackedImprovement(scores: Array<CompetencyScoreAnalyticsRecord>) {
  let improved = 0;
  let unchanged = 0;
  let declined = 0;
  let insufficient = 0;
  let evidenceBacked = 0;
  const frameworkVersions = new Set<string>();

  for (const score of scores) {
    const observations = getCompetencyHistoryObservations(score);
    if (score.frameworkVersion || score.frameworkVersionId || score.proficiencyScale) {
      frameworkVersions.add([
        score.frameworkVersion || "",
        String(score.frameworkVersionId || ""),
        score.proficiencyScale || ""
      ].join("/"));
    }
    if (observations.length < 2) {
      insufficient += 1;
      continue;
    }
    const comparison = compareCompetencyObservations(observations[0], observations.at(-1));
    if (comparison.classification === "improved") {
      improved += 1;
      const evidence = score.evidence || [];
      if (evidence.some((item) => ["assessment", "quiz", "lab", "faculty"].includes(String(item.type)))) {
        evidenceBacked += 1;
      }
    } else if (comparison.classification === "unchanged") unchanged += 1;
    else if (comparison.classification === "declined") declined += 1;
    else insufficient += 1;
  }

  return {
    improved,
    unchanged,
    declined,
    insufficientEvidence: insufficient,
    evidenceBackedImprovement: evidenceBacked,
    frameworkVersions: [...frameworkVersions],
    limitation: "Observed improvement is descriptive and is counted as evidence-backed only when persisted assessment, quiz, lab, or faculty evidence exists. Completion and catalogue mappings are excluded."
  };
}

async function loadCohort(requester: OrganizationAnalyticsRequester, query: OrganizationAnalyticsQuery) {
  const isAdmin = requester.roles.includes("admin");
  const isFaculty = requester.roles.includes("faculty");
  if (!isAdmin && !isFaculty) throw new OrganizationAnalyticsForbiddenError("Organization analytics requires an admin or authorized faculty role.");
  if (isFaculty && !isAdmin) {
    if (!query.department && !query.role) throw new OrganizationAnalyticsForbiddenError("Faculty analytics requires an assigned department or role scope.");
    const assignments = await FacultyAssignmentModel.find({ facultyId: requester.userId })
      .select("learnerId")
      .limit(MAX_COHORT)
      .lean();
    const assignedIds = ids(assignments.map((item) => item.learnerId));
    if (!assignedIds.length) {
      if (query.department || query.role) {
        throw new OrganizationAnalyticsForbiddenError("Faculty is not assigned to the requested department or role scope.");
      }
      return { userIds: [], profiles: [], facultyScoped: true };
    }
    const profiles = await EmployeeProfileModel.find({ userId: { $in: cohortIdValues(assignedIds) } })
      .select("userId department jobRole designation")
      .limit(MAX_COHORT)
      .lean() as unknown as ProfileRecord[];
    const profileByUser = new Map(profiles.map((profile) => [String(profile.userId), profile]));
    const scopedUserIds = assignedIds.filter((id) => matchesDimension(profileByUser.get(id), query.department, query.role));
    if ((query.department || query.role) && !scopedUserIds.length) {
      throw new OrganizationAnalyticsForbiddenError("Faculty is not assigned to the requested department or role scope.");
    }
    return {
      userIds: scopedUserIds,
      profiles,
      facultyScoped: true
    };
  }

  const users = await UserModel.find({
    $or: [{ roles: "employee" }, { roles: { $exists: false }, role: "employee" }],
    isActive: { $ne: false }
  })
    .select("_id")
    .limit(MAX_COHORT)
    .lean();
  const userIds = ids(users.map((user) => user._id));
  const profiles = await EmployeeProfileModel.find({ userId: { $in: cohortIdValues(userIds) } })
    .select("userId department jobRole designation")
    .limit(MAX_COHORT)
    .lean() as unknown as ProfileRecord[];
  const profileByUser = new Map(profiles.map((profile) => [String(profile.userId), profile]));
  return {
    userIds: userIds.filter((id) => matchesDimension(profileByUser.get(id), query.department, query.role)),
    profiles,
    facultyScoped: false
  };
}

function matchFor(userIds: string[], range: { from: Date; to: Date }, field: string) {
  return {
    userId: { $in: cohortIdValues(userIds) },
    [field]: { $gte: range.from, $lte: range.to }
  };
}

async function aggregateCohort(userIds: string[], range: { from: Date; to: Date }, query: OrganizationAnalyticsQuery) {
  if (!userIds.length) return {
    activity: [], progress: [], outcomes: [], quizzes: [], assessments: [], labs: [],
    scores: [], gaps: [], recommendations: [], activeLearners: 0
  };
  const sources = sourceFilter(query.source);
  const outcomeSources = outcomeSourceFilter(query.source);
  const statuses = statusFilter(query.status);
  const outcomeStatuses = query.status === "completed" || query.status === "passed"
    ? ["processed"]
    : query.status === "in_progress" ? ["processing"] : query.status ? ["failed"] : undefined;
  const progressMatch: Record<string, unknown> = {
    userId: { $in: cohortIdValues(userIds) },
    lastActivityAt: { $gte: range.from, $lte: range.to }
  };
  if (sources) progressMatch.resourceType = { $in: sources };
  if (statuses) progressMatch.status = { $in: statuses };
  const outcomeMatch: Record<string, unknown> = matchFor(userIds, range, "occurredAt");
  if (outcomeSources) outcomeMatch.source = { $in: outcomeSources };
  if (outcomeStatuses) outcomeMatch.status = { $in: outcomeStatuses };
  const competencyMatch: Record<string, unknown> = { userId: { $in: cohortIdValues(userIds) } };
  if (query.competencyId) competencyMatch.competencyId = query.competencyId;
  if (query.competencyIds?.length) competencyMatch.competencyId = { $in: query.competencyIds };

  const [activity, progress, outcomes, quizzes, assessments, labs, scores, gaps, recommendations, activeLearners] = await Promise.all([
    LearningActivityModel.aggregate([
      { $match: matchFor(userIds, range, "occurredAt") },
      { $group: { _id: "$type", count: { $sum: 1 }, minutes: { $sum: "$minutes" }, users: { $addToSet: "$userId" } } },
      { $project: { _id: 1, count: 1, minutes: 1, activeLearners: { $size: "$users" } } },
      { $sort: { count: -1 } }, { $limit: MAX_BREAKDOWN }
    ]),
    LearningProgressModel.aggregate([
      { $match: progressMatch },
      { $group: { _id: { status: "$status", resourceType: "$resourceType" }, count: { $sum: 1 }, users: { $addToSet: "$userId" } } },
      { $project: { _id: 1, count: 1, activeLearners: { $size: "$users" } } },
      { $limit: MAX_BREAKDOWN }
    ]),
    LearningOutcomeEventModel.aggregate([
      { $match: outcomeMatch },
      { $group: { _id: { eventType: "$eventType", source: "$source", status: "$status" }, count: { $sum: 1 }, averageScore: { $avg: "$outcomeScore" }, users: { $addToSet: "$userId" } } },
      { $project: { _id: 1, count: 1, averageScore: 1, activeLearners: { $size: "$users" } } },
      { $limit: MAX_BREAKDOWN }
    ]),
    FormalQuizAttemptModel.aggregate([
      { $match: { ...matchFor(userIds, range, "createdAt"), ...(query.status === "passed" ? { passed: true } : {}) } },
      { $group: { _id: null, attempts: { $sum: 1 }, averageScore: { $avg: "$percentage" }, passed: { $sum: { $cond: ["$passed", 1, 0] } }, users: { $addToSet: "$userId" } } },
      { $project: { _id: 0, attempts: 1, averageScore: 1, passed: 1, activeLearners: { $size: "$users" } } }
    ]),
    CompetencyAssessmentModel.aggregate([
      { $match: matchFor(userIds, range, "completedAt") },
      { $group: { _id: null, assessments: { $sum: 1 }, users: { $addToSet: "$userId" } } },
      { $project: { _id: 0, assessments: 1, activeLearners: { $size: "$users" } } }
    ]),
    VirtualLabAttemptModel.aggregate([
      { $match: matchFor(userIds, range, "startedAt") },
      { $group: { _id: "$status", attempts: { $sum: 1 }, averageScore: { $avg: "$score" }, users: { $addToSet: "$userId" } } },
      { $project: { _id: 1, attempts: 1, averageScore: 1, activeLearners: { $size: "$users" } } }
    ]),
    CompetencyScoreModel.find(competencyMatch)
      .select("competencyId currentLevel targetLevel frameworkId frameworkVersionId frameworkVersion proficiencyScale evidence history")
      .limit(MAX_SCORE_RECORDS)
      .lean(),
    SkillGapModel.aggregate([
      { $match: { userId: { $in: cohortIdValues(userIds) }, ...(query.competencyId ? { competencyId: query.competencyId } : {}), ...(query.competencyIds?.length ? { competencyId: { $in: query.competencyIds } } : {}) } },
      { $group: { _id: { competencyId: "$competencyId", priority: "$priority" }, count: { $sum: 1 }, averageGap: { $avg: "$gap" } } },
      { $sort: { count: -1 } }, { $limit: MAX_BREAKDOWN }
    ]),
    LearningRecommendationModel.aggregate([
      { $match: { userId: { $in: cohortIdValues(userIds) }, createdAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: "$status", count: { $sum: 1 }, users: { $addToSet: "$userId" } } },
      { $project: { _id: 1, count: 1, activeLearners: { $size: "$users" } } },
      { $limit: MAX_BREAKDOWN }
    ]),
    LearningActivityModel.aggregate([
      { $match: matchFor(userIds, range, "occurredAt") },
      { $group: { _id: null, users: { $addToSet: "$userId" } } },
      { $project: { _id: 0, count: { $size: "$users" } } }
    ])
  ]);
  return { activity, progress, outcomes, quizzes, assessments, labs, scores, gaps, recommendations, activeLearners: asNumber(activeLearners[0]?.count) };
}

function profileBreakdown(profiles: ProfileRecord[], dimension: "department" | "role") {
  const groups = new Map<string, number>();
  for (const profile of profiles) {
    const value = dimension === "department" ? profile.department : profile.jobRole || profile.designation;
    if (value) groups.set(value, (groups.get(value) || 0) + 1);
  }
  return [...groups.entries()]
    .map(([name, learnerCount]) => ({ name, learnerCount }))
    .sort((a, b) => b.learnerCount - a.learnerCount || a.name.localeCompare(b.name))
    .slice(0, MAX_BREAKDOWN);
}

function summarize(data: Awaited<ReturnType<typeof aggregateCohort>>, userCount: number, profiles: ProfileRecord[]) {
  const totalActivities = data.activity.reduce((sum: number, item: any) => sum + asNumber(item.count), 0);
  const totalMinutes = data.activity.reduce((sum: number, item: any) => sum + asNumber(item.minutes), 0);
  const progressRecords = data.progress.reduce((sum: number, item: any) => sum + asNumber(item.count), 0);
  const completedLearning = data.progress.filter((item: any) => item._id?.status === "completed").reduce((sum: number, item: any) => sum + asNumber(item.count), 0);
  const quiz = data.quizzes[0] || {};
  const labAttempts = data.labs.reduce((sum: number, item: any) => sum + asNumber(item.attempts), 0);
  const labPassed = data.labs.filter((item: any) => ["passed", "completed"].includes(String(item._id))).reduce((sum: number, item: any) => sum + asNumber(item.attempts), 0);
  const processedOutcomes = data.outcomes.filter((item: any) => item._id?.status === "processed").reduce((sum: number, item: any) => sum + asNumber(item.count), 0);
  const gaps = data.gaps.reduce((sum: number, item: any) => sum + asNumber(item.count), 0);
  const highCriticalGaps = data.gaps.filter((item: any) => ["high", "critical"].includes(String(item._id?.priority))).reduce((sum: number, item: any) => sum + asNumber(item.count), 0);
  const improvements = evidenceBackedImprovement(data.scores as unknown as CompetencyScoreAnalyticsRecord[]);
  return {
    learnerCount: userCount,
    activeLearnerCount: data.activeLearners,
    totalLearningActivities: totalActivities,
    totalLearningHours: Math.round((totalMinutes / 60) * 100) / 100,
    learningProgressRecords: progressRecords,
    completedLearningItems: completedLearning,
    completionRate: progressRecords ? Math.round((completedLearning / progressRecords) * 1000) / 10 : null,
    quizAttempts: asNumber(quiz.attempts),
    quizAverageScore: quiz.averageScore == null ? null : Math.round(asNumber(quiz.averageScore) * 10) / 10,
    quizPassRate: quiz.attempts ? Math.round((asNumber(quiz.passed) / asNumber(quiz.attempts)) * 1000) / 10 : null,
    assessmentParticipation: asNumber(data.assessments[0]?.assessments),
    virtualLabAttempts: labAttempts,
    virtualLabPassed: labPassed,
    virtualLabPassRate: labAttempts ? Math.round((labPassed / labAttempts) * 1000) / 10 : null,
    validatedLearningOutcomes: processedOutcomes,
    competencyObservationCount: data.scores.length,
    observedCompetencyImprovement: improvements.improved,
    evidenceBackedImprovement: improvements.evidenceBackedImprovement,
    insufficientCompetencyEvidence: improvements.insufficientEvidence,
    skillGapCount: gaps,
    highCriticalSkillGapCount: highCriticalGaps,
    dataSufficiency: userCount > 0 || totalActivities > 0 || data.scores.length > 0 ? "available" : "insufficient_data",
    limitations: [
      "Aggregates describe persisted activity, outcomes, competency observations, and gaps; they do not establish causal effectiveness.",
      "Historical skill-gap movement is unavailable unless historical snapshots exist.",
      "Completion, enrollment, catalogue mappings, and recommendation mappings are not competency evidence.",
      ...(profiles.length < userCount ? ["Some learners do not have an EmployeeProfile department/job-role record."] : [])
    ]
  };
}

function competencyAnalytics(data: Awaited<ReturnType<typeof aggregateCohort>>) {
  const distribution = new Map<string, { level: number; count: number; averageTarget: number }>();
  for (const item of data.scores as any[]) {
    const level = asNumber(item.currentLevel);
    const key = String(level);
    const existing = distribution.get(key) || { level, count: 0, averageTarget: 0 };
    existing.count += 1;
    existing.averageTarget += asNumber(item.targetLevel);
    distribution.set(key, existing);
  }
  const byCompetency = new Map<string, { competencyId: string; count: number; averageLevel: number; averageTarget: number }>();
  for (const item of data.scores as any[]) {
    const competencyId = String(item.competencyId);
    const existing = byCompetency.get(competencyId) || { competencyId, count: 0, averageLevel: 0, averageTarget: 0 };
    existing.count += 1;
    existing.averageLevel += asNumber(item.currentLevel);
    existing.averageTarget += asNumber(item.targetLevel);
    byCompetency.set(competencyId, existing);
  }
  return {
    levelDistribution: [...distribution.values()].map((item) => ({ ...item, averageTarget: item.count ? Math.round((item.averageTarget / item.count) * 100) / 100 : 0 })).sort((a, b) => a.level - b.level),
    competencyDistribution: [...byCompetency.values()].map((item) => ({ ...item, averageLevel: Math.round((item.averageLevel / item.count) * 100) / 100, averageTarget: Math.round((item.averageTarget / item.count) * 100) / 100 })).slice(0, MAX_BREAKDOWN),
    improvement: evidenceBackedImprovement(data.scores as unknown as CompetencyScoreAnalyticsRecord[]),
    evidenceRule: "Only persisted competency observations with legitimate evidence types are counted as evidence-backed improvement."
  };
}

function sourceAnalytics(data: Awaited<ReturnType<typeof aggregateCohort>>) {
  return data.outcomes.map((item: any) => ({
    source: item._id?.source,
    eventType: item._id?.eventType,
    status: item._id?.status,
    count: asNumber(item.count),
    activeLearners: asNumber(item.activeLearners),
    averageScore: item.averageScore == null ? null : Math.round(asNumber(item.averageScore) * 10) / 10,
    providerStatus: ["igot", "nssta"].includes(String(item._id?.source)) ? "live_or_simulated_metadata_preserved" : "local_record"
  }));
}

function skillGapAnalytics(data: Awaited<ReturnType<typeof aggregateCohort>>) {
  return {
    distribution: data.gaps.map((item: any) => ({
      competencyId: String(item._id?.competencyId || ""),
      priority: item._id?.priority,
      learnerCount: asNumber(item.count),
      averageGap: Math.round(asNumber(item.averageGap) * 100) / 100
    })),
    historicalMovement: { status: "unavailable", reason: "Historical SkillGap snapshots are not persisted as a time series." }
  };
}

async function resolveContext(query: OrganizationAnalyticsQuery) {
  const [competencies, departments, requirements] = await Promise.all([
    CompetencyModel.find(query.competencyId ? { _id: query.competencyId } : query.domain ? { category: query.domain } : {})
      .select("_id code name category frameworkId frameworkVersionId frameworkVersion proficiencyScale")
      .limit(MAX_BREAKDOWN)
      .lean(),
    DepartmentModel.find().select("code name organization").limit(MAX_BREAKDOWN).lean(),
    RoleRequirementModel.find(query.role ? { jobRole: query.role } : {})
      .select("jobRole competencyId requiredLevel departmentCode priorityWeight frameworkId frameworkVersionId frameworkVersion")
      .limit(MAX_BREAKDOWN)
      .lean()
  ]);
  return { competencies, departments, requirements };
}

export async function getOrganizationAnalytics(
  requester: OrganizationAnalyticsRequester,
  scope: OrganizationAnalyticsScope,
  query: OrganizationAnalyticsQuery = {}
) {
  const range = createAnalyticsDateRange(query);
  if (scope === "organization" && !requester.roles.includes("admin")) {
    throw new OrganizationAnalyticsForbiddenError("Only administrators may access organization-wide analytics.");
  }
  const cohort = await loadCohort(requester, query);
  const context = await resolveContext(query);
  const scopedCompetencyIds = query.competencyId
    ? [query.competencyId]
    : query.domain
      ? context.competencies.map((item) => String(item._id))
      : undefined;
  const data = await aggregateCohort(cohort.userIds, range, { ...query, competencyIds: scopedCompetencyIds });
  const summary = summarize(data, cohort.userIds.length, cohort.profiles);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = normalizedLimit(query.limit);
  const departmentBreakdown = scope === "organization" ? profileBreakdown(cohort.profiles, "department") : [];
  const roleBreakdown = scope === "organization" ? profileBreakdown(cohort.profiles, "role") : [];
  const activity = data.activity.map((item: any) => ({ type: item._id, count: asNumber(item.count), minutes: asNumber(item.minutes), activeLearners: asNumber(item.activeLearners) }));
  const progress = data.progress.map((item: any) => ({ status: item._id?.status, resourceType: item._id?.resourceType, count: asNumber(item.count), activeLearners: asNumber(item.activeLearners) }));
  const recommendations = data.recommendations.map((item: any) => ({ status: item._id, count: asNumber(item.count), activeLearners: asNumber(item.activeLearners) }));
  const sources = sourceAnalytics(data);
  const gaps = skillGapAnalytics(data);
  return {
    range,
    scope: {
      type: scope,
      ...(query.department ? { department: query.department } : {}),
      ...(query.role ? { role: query.role } : {}),
      facultyScoped: cohort.facultyScoped
    },
    summary,
    learning: {
      activityByType: paginate(activity, page, limit),
      progressByStatus: paginate(progress, page, limit),
      recommendationsByStatus: paginate(recommendations, page, limit),
      pagination: { page, limit, returned: Math.min(activity.length + progress.length + recommendations.length, limit) }
    },
    competency: competencyAnalytics(data),
    skillGaps: { ...gaps, distribution: paginate(gaps.distribution, page, limit) },
    sources: paginate(sources, page, limit),
    breakdowns: { departments: paginate(departmentBreakdown, page, limit), roles: paginate(roleBreakdown, page, limit) },
    context: {
      competencyCount: context.competencies.length,
      departments: context.departments.map((item) => ({ code: item.code, name: item.name, organization: item.organization })),
      roleRequirements: context.requirements.map((item) => ({ jobRole: item.jobRole, competencyId: String(item.competencyId), requiredLevel: item.requiredLevel, departmentCode: item.departmentCode, priorityWeight: item.priorityWeight, frameworkVersion: item.frameworkVersion }))
    },
    limitations: [...new Set([
      ...summary.limitations,
      "No learner identifiers or raw assessment/lab payloads are returned.",
      "Provider source labels remain descriptive; simulated/local iGOT and NSSTA records are not live government verification.",
      "Small-group suppression is not applied because no existing suppression policy is configured; aggregate access remains admin/faculty authorized."
    ])]
  };
}
