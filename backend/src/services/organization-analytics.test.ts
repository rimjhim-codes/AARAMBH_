import assert from "node:assert/strict";
import test from "node:test";
import {
  CompetencyAssessmentModel,
  CompetencyModel,
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
  getOrganizationAnalytics,
  OrganizationAnalyticsForbiddenError
} from "./organization-analytics.service";
import { AnalyticsDateRangeError } from "./analytics-foundation.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function query<T>(value: T) {
  const chain: any = {
    select: () => chain,
    limit: () => chain,
    sort: () => chain,
    lean: async () => value
  };
  return chain;
}

function setupReadFixtures(restores: Array<() => void>, evidenceType = "course") {
  patch(UserModel, "find", () => query([{ _id: "learner-1" }, { _id: "learner-2" }]), restores);
  patch(EmployeeProfileModel, "find", () => query([
    { userId: "learner-1", department: "Engineering", jobRole: "Developer" },
    { userId: "learner-2", department: "Engineering", jobRole: "Developer" }
  ]), restores);
  patch(FacultyAssignmentModel, "find", () => query([]), restores);
  patch(CompetencyModel, "find", () => query([{ _id: "competency-1", code: "PY", name: "Python", category: "technical" }]), restores);
  patch(DepartmentModel, "find", () => query([{ code: "ENG", name: "Engineering", organization: "ARAMBH" }]), restores);
  patch(RoleRequirementModel, "find", () => query([{ jobRole: "Developer", competencyId: "competency-1", requiredLevel: 4, departmentCode: "ENG", priorityWeight: 1 }]), restores);
  patch(CompetencyScoreModel, "find", () => query([{
    competencyId: "competency-1",
    currentLevel: 3,
    targetLevel: 4,
    frameworkVersion: "v1",
    proficiencyScale: "0-5",
    history: [
      { date: new Date("2026-08-01"), level: 2, frameworkVersion: "v1", proficiencyScale: "0-5" },
      { date: new Date("2026-08-20"), level: 3, frameworkVersion: "v1", proficiencyScale: "0-5" }
    ],
    evidence: [{ type: evidenceType, key: "course-completion" }]
  }]), restores);

  let activityAggregateCalls = 0;
  patch(LearningActivityModel, "aggregate", async () => {
    activityAggregateCalls += 1;
    return activityAggregateCalls === 1
      ? [{ _id: "course", count: 4, minutes: 120, activeLearners: 2 }]
      : [{ count: 2 }];
  }, restores);
  patch(LearningProgressModel, "aggregate", async () => [{ _id: { status: "completed", resourceType: "platform_course" }, count: 2, activeLearners: 2 }], restores);
  patch(LearningOutcomeEventModel, "aggregate", async () => [{ _id: { eventType: "course.completed", source: "platform", status: "processed" }, count: 2, averageScore: null, activeLearners: 2 }], restores);
  patch(FormalQuizAttemptModel, "aggregate", async () => [{ attempts: 2, averageScore: 80, passed: 1, activeLearners: 1 }], restores);
  patch(CompetencyAssessmentModel, "aggregate", async () => [{ assessments: 1, activeLearners: 1 }], restores);
  patch(VirtualLabAttemptModel, "aggregate", async () => [{ _id: "passed", attempts: 1, averageScore: 90, activeLearners: 1 }], restores);
  patch(SkillGapModel, "aggregate", async () => [{ _id: { competencyId: "competency-1", priority: "high" }, count: 1, averageGap: 1 }], restores);
  patch(LearningRecommendationModel, "aggregate", async () => [{ _id: "completed", count: 1, activeLearners: 1 }], restores);
}

test("organization analytics aggregates persisted learning data without PII or writes", async () => {
  const restores: Array<() => void> = [];
  setupReadFixtures(restores);
  try {
    const result = await getOrganizationAnalytics({ userId: "admin-1", roles: ["admin"] }, "organization", {
      now: new Date("2026-09-08T00:00:00Z"),
      limit: 20
    });
    assert.equal(result.scope.type, "organization");
    assert.equal(result.summary.learnerCount, 2);
    assert.equal(result.summary.activeLearnerCount, 2);
    assert.equal(result.summary.totalLearningHours, 2);
    assert.equal(result.summary.completedLearningItems, 2);
    assert.equal(result.summary.validatedLearningOutcomes, 2);
    assert.equal(result.summary.highCriticalSkillGapCount, 1);
    assert.equal(result.competency.improvement.evidenceBackedImprovement, 0);
    assert.equal(result.sources[0].providerStatus, "local_record");
    assert.equal(JSON.stringify(result).includes("email"), false);
    assert.equal(JSON.stringify(result).includes("rawCode"), false);
    assert.equal(JSON.stringify(result).includes("submission"), false);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("completion/catalog context does not become evidence-backed improvement", async () => {
  const restores: Array<() => void> = [];
  setupReadFixtures(restores, "course");
  try {
    const result = await getOrganizationAnalytics({ userId: "admin-1", roles: ["admin"] }, "organization", {
      competencyId: "competency-1",
      now: new Date("2026-09-08T00:00:00Z")
    });
    assert.equal(result.competency.improvement.improved, 1);
    assert.equal(result.competency.improvement.evidenceBackedImprovement, 0);
    assert.match(result.competency.improvement.limitation, /Completion and catalogue mappings are excluded/);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("legitimate persisted assessment evidence supports observed improvement", async () => {
  const restores: Array<() => void> = [];
  setupReadFixtures(restores, "assessment");
  try {
    const result = await getOrganizationAnalytics({ userId: "admin-1", roles: ["admin"] }, "organization", {
      now: new Date("2026-09-08T00:00:00Z")
    });
    assert.equal(result.competency.improvement.evidenceBackedImprovement, 1);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("department and role scopes use persisted employee profile dimensions", async () => {
  const restores: Array<() => void> = [];
  setupReadFixtures(restores);
  try {
    const department = await getOrganizationAnalytics({ userId: "admin-1", roles: ["admin"] }, "department", {
      department: "Engineering",
      now: new Date("2026-09-08T00:00:00Z")
    });
    const role = await getOrganizationAnalytics({ userId: "admin-1", roles: ["admin"] }, "role", {
      role: "Developer",
      now: new Date("2026-09-08T00:00:00Z")
    });
    assert.equal(department.scope.type, "department");
    assert.equal(department.scope.department, "Engineering");
    assert.equal(department.summary.learnerCount, 2);
    assert.equal(role.scope.type, "role");
    assert.equal(role.scope.role, "Developer");
    assert.equal(role.summary.learnerCount, 2);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("organization progress and recommendation aggregation respects the bounded date range", async () => {
  const restores: Array<() => void> = [];
  setupReadFixtures(restores);
  let progressPipeline: any[] = [];
  let recommendationPipeline: any[] = [];
  patch(LearningProgressModel, "aggregate", async (pipeline: any[]) => {
    progressPipeline = pipeline;
    return [{ _id: { status: "completed", resourceType: "platform_course" }, count: 1, activeLearners: 1 }];
  }, restores);
  patch(LearningRecommendationModel, "aggregate", async (pipeline: any[]) => {
    recommendationPipeline = pipeline;
    return [{ _id: "completed", count: 1, activeLearners: 1 }];
  }, restores);
  try {
    await getOrganizationAnalytics({ userId: "admin-1", roles: ["admin"] }, "organization", {
      from: "2026-08-01T00:00:00Z",
      to: "2026-08-31T00:00:00Z"
    });
    assert.deepEqual(progressPipeline[0].$match.lastActivityAt, {
      $gte: new Date("2026-08-01T00:00:00Z"),
      $lte: new Date("2026-08-31T00:00:00Z")
    });
    assert.deepEqual(recommendationPipeline[0].$match.createdAt, {
      $gte: new Date("2026-08-01T00:00:00Z"),
      $lte: new Date("2026-08-31T00:00:00Z")
    });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("ordinary learners are denied organization analytics and invalid ranges are rejected", async () => {
  await assert.rejects(
    () => getOrganizationAnalytics({ userId: "learner-1", roles: ["employee"] }, "organization"),
    OrganizationAnalyticsForbiddenError
  );
  await assert.rejects(
    () => getOrganizationAnalytics({ userId: "admin-1", roles: ["admin"] }, "organization", {
      from: "2026-03-01T00:00:00Z",
      to: "2026-02-01T00:00:00Z"
    }),
    AnalyticsDateRangeError
  );
});

test("faculty analytics requires an assigned dimension and rejects an unassigned scope", async () => {
  const restores: Array<() => void> = [];
  setupReadFixtures(restores);
  try {
    await assert.rejects(
      () => getOrganizationAnalytics({ userId: "faculty-1", roles: ["faculty"] }, "department", { department: "Engineering" }),
      OrganizationAnalyticsForbiddenError
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
