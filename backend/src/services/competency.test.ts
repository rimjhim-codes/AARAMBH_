import assert from "node:assert/strict";
import test from "node:test";
import { CompetencyModel, CompetencyScoreModel, EmployeeProfileModel, RoleRequirementModel, SkillGapModel } from "../models/sih/SihModels";
import { applyQuizCompetencyImpact, confidenceFromEvidence, inferProfileEvidenceLevel, levelFromAssessmentAccuracy, recalculateSkillGaps, summarizeEvidence } from "./competency.service";
import { ensureEmployeeProfileForUser } from "./employee-profile.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

test("profile evidence maps current skills and training to a baseline level", () => {
  const profile = {
    currentSkills: ["SQL", "Basic Python", "Survey Design"],
    previousTrainings: ["Introduction to SPSS"]
  };
  assert.equal(inferProfileEvidenceLevel({ name: "SQL", keywords: ["sql", "database"] }, profile).level, 2);
  assert.equal(inferProfileEvidenceLevel({ name: "Python", keywords: ["python", "pandas"] }, profile).level, 2);
  assert.equal(inferProfileEvidenceLevel({ name: "SPSS", keywords: ["spss"] }, profile).level, 1);
  assert.equal(inferProfileEvidenceLevel({ name: "National Accounts", keywords: ["gdp"] }, profile).level, 0);
  assert.equal(inferProfileEvidenceLevel({ name: "Python", keywords: ["python"] }, {
    currentSkills: ["Python"], previousTrainings: ["Python for Data Analysis"]
  }).level, 2);
});

test("confidence reflects evidence strength rather than proficiency", () => {
  assert.equal(confidenceFromEvidence([{ type: "profile", detail: "Self-reported SQL" }]), "low");
  assert.equal(confidenceFromEvidence([{ type: "assessment" }, { type: "profile" }]), "medium");
  assert.equal(confidenceFromEvidence([{ type: "assessment" }, { type: "quiz" }]), "high");
});

test("evidence summaries are deterministic and do not fabricate sources", () => {
  assert.equal(
    summarizeEvidence([
      { type: "assessment", detail: "Accuracy 78%" },
      { type: "assessment", detail: "A second attempt" },
      { type: "lab", detail: "Completed Python lab" }
    ]),
    "assessment: Accuracy 78%; lab: Completed Python lab"
  );
});

test("assessment accuracy preserves the existing 0-5 level bands", () => {
  assert.equal(levelFromAssessmentAccuracy(0), 0);
  assert.equal(levelFromAssessmentAccuracy(39), 1);
  assert.equal(levelFromAssessmentAccuracy(60), 3);
  assert.equal(levelFromAssessmentAccuracy(89), 4);
  assert.equal(levelFromAssessmentAccuracy(100), 5);
});

test("employee profile bootstrap creates the minimal onboarding record without inventing role data", async () => {
  const restores: Array<() => void> = [];
  const calls: any[] = [];
  patch(EmployeeProfileModel, "findOneAndUpdate", (filter: any, update: any, options: any) => {
    calls.push({ filter, update, options });
    return { lean: async () => ({ userId: "user-1" }) };
  }, restores);
  try {
    const profile = await ensureEmployeeProfileForUser("user-1");
    assert.deepEqual(calls[0].filter, { userId: "user-1" });
    assert.deepEqual(calls[0].update, { $set: { userId: "user-1" } });
    assert.deepEqual(calls[0].options, { upsert: true, new: true, setDefaultsOnInsert: true });
    assert.equal(profile?.userId, "user-1");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("skill-gap refresh scopes reads and replacement to affected competencies", async () => {
  const restores: Array<() => void> = [];
  const filters: any = {};
  const scopedId = "competency-1";
  patch(EmployeeProfileModel, "findOne", () => ({ lean: async () => ({ userId: "user-1", jobRole: "Analyst" }) }), restores);
  patch(RoleRequirementModel, "find", () => ({
    populate: () => ({ lean: async () => [
      { competencyId: scopedId, requiredLevel: 3, frameworkId: "fw", frameworkVersion: "1" },
      { competencyId: "competency-2", requiredLevel: 4, frameworkId: "fw", frameworkVersion: "1" }
    ] })
  }), restores);
  patch(CompetencyScoreModel, "find", (filter: any) => {
    filters.score = filter;
    return { select: () => ({ lean: async () => [{ competencyId: scopedId, currentLevel: 1, confidenceTier: "low", evidence: [] }] }) };
  }, restores);
  patch(CompetencyModel, "find", (filter: any) => {
    filters.competency = filter;
    return { select: () => ({ lean: async () => [{ _id: scopedId, name: "Python", category: "technical" }] }) };
  }, restores);
  patch(SkillGapModel, "deleteMany", async (filter: any) => { filters.delete = filter; return {}; }, restores);
  patch(SkillGapModel, "insertMany", async (items: any[]) => items, restores);
  try {
    const gaps = await recalculateSkillGaps("user-1", { competencyIds: [scopedId] });
    assert.deepEqual(filters.score, { userId: "user-1", competencyId: { $in: [scopedId] } });
    assert.deepEqual(filters.competency, { _id: { $in: [scopedId] } });
    assert.deepEqual(filters.delete, { userId: "user-1", competencyId: { $in: [scopedId] } });
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].competencyId, scopedId);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("applyQuizCompetencyImpact provides positive nudge on first high-scoring quiz", async () => {
  const restores: Array<() => void> = [];
  patch(CompetencyScoreModel, "findOne", async () => null, restores);
  let updatedData: any;
  patch(CompetencyScoreModel, "findOneAndUpdate", async (filter: any, update: any) => { updatedData = update; return update; }, restores);
  try {
    await applyQuizCompetencyImpact({ userId: "u", competencyId: "c", percentage: 90, topic: "React" });
    assert.equal(updatedData.currentLevel, 3);
  } finally { restores.reverse().forEach(r => r()); }
});

test("applyQuizCompetencyImpact prevents repeated positive inflation from same logical topic", async () => {
  const restores: Array<() => void> = [];
  const existing = {
    currentLevel: 3,
    evidence: [{ type: "quiz", detail: 'Quiz on "React" scored 90%. Level 0→3.', scoreImpact: 3 }]
  };
  patch(CompetencyScoreModel, "findOne", async () => existing, restores);
  let updatedData: any;
  patch(CompetencyScoreModel, "findOneAndUpdate", async (filter: any, update: any) => { updatedData = update; return update; }, restores);
  try {
    await applyQuizCompetencyImpact({ userId: "u", competencyId: "c", percentage: 90, topic: "React" });
    assert.equal(updatedData.currentLevel, 3); // Capped to prev (3), would normally be 4
  } finally { restores.reverse().forEach(r => r()); }
});

test("applyQuizCompetencyImpact grants +1 for genuinely different quiz topic", async () => {
  const restores: Array<() => void> = [];
  const existing = {
    currentLevel: 3,
    evidence: [{ type: "quiz", detail: 'Quiz on "React" scored 90%. Level 0→3.', scoreImpact: 3 }]
  };
  patch(CompetencyScoreModel, "findOne", async () => existing, restores);
  let updatedData: any;
  patch(CompetencyScoreModel, "findOneAndUpdate", async (filter: any, update: any) => { updatedData = update; return update; }, restores);
  try {
    await applyQuizCompetencyImpact({ userId: "u", competencyId: "c", percentage: 90, topic: "Node.js" });
    assert.equal(updatedData.currentLevel, 4); // Grants +1 for new topic
  } finally { restores.reverse().forEach(r => r()); }
});

test("applyQuizCompetencyImpact remains idempotent with duplicate evidenceKey", async () => {
  const restores: Array<() => void> = [];
  const existing = {
    currentLevel: 3,
    evidence: [{ key: "event-123", type: "quiz" }]
  };
  patch(CompetencyScoreModel, "findOne", async () => existing, restores);
  let updatedData: any = null;
  patch(CompetencyScoreModel, "findOneAndUpdate", async (filter: any, update: any) => { updatedData = update; return update; }, restores);
  try {
    const result = await applyQuizCompetencyImpact({ userId: "u", competencyId: "c", percentage: 90, topic: "React", evidenceKey: "event-123" });
    assert.deepEqual(result, existing);
    assert.equal(updatedData, null); // Did not call findOneAndUpdate
  } finally { restores.reverse().forEach(r => r()); }
});

test("confidence decay: fresh assessment + fresh quiz => high", () => {
  const at = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago (FRESH)
  assert.equal(confidenceFromEvidence([{ type: "assessment", at }, { type: "quiz", at }]), "high");
});

test("confidence decay: fresh assessment + profile => medium", () => {
  const at = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago (FRESH)
  assert.equal(confidenceFromEvidence([{ type: "assessment", at }, { type: "profile" }]), "medium");
});

test("confidence decay: only profile => low", () => {
  assert.equal(confidenceFromEvidence([{ type: "profile" }]), "low");
});

test("confidence decay: 12-month boundary (AGING) degrades by one tier", () => {
  const agingDate = new Date(Date.now() - 15 * 30 * 24 * 60 * 60 * 1000); // ~15 months ago (AGING)
  // Base HIGH degrades to MEDIUM
  assert.equal(confidenceFromEvidence([{ type: "assessment", at: agingDate }, { type: "quiz", at: agingDate }]), "medium");
  // Base MEDIUM degrades to LOW
  assert.equal(confidenceFromEvidence([{ type: "assessment", at: agingDate }, { type: "profile" }]), "low");
});

test("confidence decay: 24-month boundary (STALE) does not remain permanently high", () => {
  const staleDate = new Date(Date.now() - 36 * 30 * 24 * 60 * 60 * 1000); // ~36 months ago (STALE)
  // Base HIGH degrades to LOW because stale evidence alone must not support HIGH
  assert.equal(confidenceFromEvidence([{ type: "assessment", at: staleDate }, { type: "quiz", at: staleDate }]), "low");
  assert.equal(confidenceFromEvidence([{ type: "assessment", at: staleDate }, { type: "profile" }]), "low");
});

test("confidence decay: missing `at` remains backward compatible (treated as fresh)", () => {
  // Base HIGH without `at` should remain HIGH (legacy behavior)
  assert.equal(confidenceFromEvidence([{ type: "assessment" }, { type: "quiz" }]), "high");
});

test("confidence decay: invalid `at` does not crash and is treated as fresh", () => {
  // Invalid string for `at`
  assert.equal(confidenceFromEvidence([{ type: "assessment", at: "invalid-date-string" }, { type: "quiz", at: "invalid-date-string" }]), "high");
});

test("confidence decay: currentLevel is unaffected by confidence decay", async () => {
  const staleDate = new Date(Date.now() - 36 * 30 * 24 * 60 * 60 * 1000); // STALE
  const restores: Array<() => void> = [];
  const existing = {
    currentLevel: 4,
    evidence: [{ type: "assessment", detail: "Topic", scoreImpact: 1, at: staleDate }]
  };
  patch(CompetencyScoreModel, "findOne", async () => existing, restores);
  let updatedData: any;
  patch(CompetencyScoreModel, "findOneAndUpdate", async (filter: any, update: any) => { updatedData = update; return update; }, restores);
  
  try {
    await applyQuizCompetencyImpact({ userId: "u", competencyId: "c", percentage: 90, topic: "New Topic" });
    // It should increase from 4 to 5 because it's a high scoring quiz on a NEW topic
    assert.equal(updatedData.currentLevel, 5);
    // The confidence should include the STALE assessment + the new FRESH quiz
    // So 1 STALE + 1 FRESH = Base HIGH, freshest is FRESH -> remains HIGH
    assert.equal(updatedData.confidence, "high");
  } finally { restores.reverse().forEach(r => r()); }
});
