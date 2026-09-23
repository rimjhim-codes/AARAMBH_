import assert from "node:assert/strict";
import test from "node:test";
import {
  completeCompetencyAssessment,
  startCompetencyAssessment
} from "./competency.controller";
import {
  getQuizForAttempt,
  reviewQuestion
} from "./quiz.controller";
import { finalizeCompetencyAssessment } from "../../services/competency-assessment-finalization.service";
import * as quizEngine from "../../services/quiz-engine.service";
import * as competencyService from "../../services/competency.service";
import * as recommendationService from "../../services/recommendation.service";
import * as performanceService from "../../services/performance.service";
import * as learningOutcomeService from "../../services/learning-outcome.service";
import * as learningOutcomeCoordinator from "../../services/learning-outcome-coordinator.service";
import * as auditService from "../../services/audit-log.service";
import {
  CompetencyAssessmentModel,
  CompetencyModel,
  EmployeeProfileModel,
  FormalQuizAttemptModel,
  FormalQuizModel,
  SihQuestionModel
} from "../../models/sih/SihModels";
import { UserModel } from "../../models/User";
import { NotificationModel } from "../../models/Notification";

function query<T>(value: T) {
  const result: any = {
    lean: async () => value,
    select: () => result,
    sort: () => result,
    limit: () => result,
    populate: () => result,
    then: (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(value).then(resolve, reject)
  };
  return result;
}

function responseCapture() {
  const result: { statusCode: number; body?: any } = { statusCode: 200 };
  return {
    result,
    status(code: number) { result.statusCode = code; return this; },
    json(body: unknown) { result.body = body; return this; }
  } as any;
}

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

test("competency assessment integration lifecycle uses review, finalization, attempt, and downstream updates", async () => {
  const restores: Array<() => void> = [];
  const learnerId = "64f000000000000000000001";
  const facultyId = "64f000000000000000000002";
  const assessmentId = "64f000000000000000000010";
  const quizId = "64f000000000000000000011";
  const competencyIds = ["64f000000000000000000101", "64f000000000000000000102"];
  let questionNumber = 0;
  let assessmentState: any;
  let quizState: any;
  let questions: any[] = [];
  let quizCreateCount = 0;
  let persistedQuizCount = 0;
  const downstream = { evidence: 0, gaps: 0, recommendations: 0, performance: 0, activities: 0 };

  const user = { id: learnerId, role: "employee", activeRole: "employee", roles: ["employee"] } as any;
  const reviewer = { id: facultyId, role: "admin", activeRole: "admin", roles: ["admin"] } as any;
  const competencies = competencyIds.map((id, index) => ({ _id: id, name: index === 0 ? "Statistics" : "Digital Skills" }));

  try {
    patch(EmployeeProfileModel, "findOne", () => query({ jobRole: "Statistical Officer", yearsOfExperience: 4, languagePreference: "English" }), restores);
    patch(CompetencyModel, "find", () => Promise.resolve(competencies), restores);
    patch(CompetencyModel, "findById", (id: string) => Promise.resolve(competencies.find((item) => item._id === String(id))), restores);
    patch(UserModel, "find", () => query([{ _id: "dummy-faculty-id" }]), restores);
    patch(NotificationModel, "insertMany", () => Promise.resolve(), restores);
    patch(NotificationModel, "create", () => Promise.resolve(), restores);

    patch(quizEngine, "generateCompetencyAssessmentQuestions", async (input: any) => {
      const levels = Object.entries(input.difficultyDistribution)
        .flatMap(([difficulty, count]) => Array.from({ length: count as number }, () => difficulty));
      return {
        provider: "test-fixture",
        questions: levels.map((difficulty) => ({
          question: `Which measure supports competency question ${++questionNumber}?`,
          options: { A: "Mean", B: "Median", C: "Variance", D: "Mode" },
          correctAnswer: "A",
          explanation: "The mean is the arithmetic average.",
          difficulty,
          topic: input.competencyName.toLowerCase()
        }))
      };
    }, restores);
    patch(quizEngine, "persistGeneratedQuestions", async (input: any) => {
      const saved = input.questions.map((question: any) => ({
        ...question,
        _id: `64f00000000000000000${String(++questionNumber).padStart(4, "0")}`,
        id: `64f00000000000000000${String(questionNumber).padStart(4, "0")}`,
        competencyId: input.competencyId,
        createdBy: learnerId,
        status: "pending_review",
        validationStatus: "passed"
      }));
      questions.push(...saved);
      return saved;
    }, restores);
    patch(CompetencyAssessmentModel, "create", async (input: any) => {
      assessmentState = { ...input, _id: assessmentId, id: assessmentId };
      return assessmentState;
    }, restores);

    const generationResponse = responseCapture();
    patch(CompetencyAssessmentModel, "findOne", () => query(null), restores);
    await startCompetencyAssessment({ body: { competencyIds, countPerCompetency: 3 }, user } as any, generationResponse);
    assert.equal(generationResponse.result.statusCode, 202);
    assert.equal(generationResponse.result.body.reviewRequired, true);
    assert.equal(generationResponse.result.body.status, "pending_review");
    assert.equal(generationResponse.result.body.playable, false);
    assert.equal(generationResponse.result.body.questionCount, 6);
    assert.equal(generationResponse.result.body.assessment.status, "pending_review");
    assert.equal(Array.isArray(generationResponse.result.body.questions), true);
    assert.equal(generationResponse.result.body.questions.length, 0);
    assert.equal(assessmentState.status, "pending_review");
    assert.equal(questions.length, 6);
    assert.equal(assessmentState.blueprintId, "aarambh-application-assessment-fallback");
    assert.equal(assessmentState.blueprintVersion, "1.0");

    patch(SihQuestionModel, "find", () => query(questions), restores);
    patch(CompetencyAssessmentModel, "findById", () => query(assessmentState), restores);
    patch(CompetencyAssessmentModel, "findOne", () => query(null), restores);
    patch(CompetencyAssessmentModel, "find", () => query([assessmentState]), restores);
    patch(CompetencyAssessmentModel, "findByIdAndUpdate", (id: string, update: any) => {
      if (String(id) === String(assessmentState._id)) Object.assign(assessmentState, update);
      return query(assessmentState);
    }, restores);
    patch(SihQuestionModel, "findById", (id: string) => query(questions.find((question) => String(question._id) === String(id))), restores);
    patch(SihQuestionModel, "findByIdAndUpdate", (id: string, update: any) => {
      const question = questions.find((item) => String(item._id) === String(id));
      Object.assign(question, update);
      return question;
    }, restores);
    patch(auditService, "writeAuditLog", async () => undefined, restores);

    const employeeReviewResponse = responseCapture();
    await reviewQuestion({ params: { id: questions[0]._id }, body: { status: "approved" }, user } as any, employeeReviewResponse);
    assert.equal(employeeReviewResponse.result.statusCode, 403);

    const pendingFinalize = finalizeCompetencyAssessment({ assessmentId, finalizedBy: facultyId });
    await assert.rejects(pendingFinalize, /pending_review/);

    for (const question of questions) {
      const reviewResponse = responseCapture();
      await reviewQuestion({ params: { id: question._id }, body: { status: "approved" }, user: { ...reviewer } } as any, reviewResponse);
      assert.equal(reviewResponse.result.statusCode, 200);
    }
    assert.ok(questions.every((question) => question.status === "approved"));

    patch(SihQuestionModel, "find", () => query(questions), restores);
    patch(CompetencyAssessmentModel, "findById", () => query(assessmentState), restores);
    patch(CompetencyAssessmentModel, "findOne", () => query(null), restores);
    let releaseFirstCreate!: () => void;
    const bothCreateCalls = new Promise<void>((resolve) => { releaseFirstCreate = resolve; });
    patch(FormalQuizModel, "create", async (input: any) => {
      quizCreateCount += 1;
      if (quizCreateCount === 1) {
        await bothCreateCalls;
        return quizState;
      }
      quizState = { ...input, _id: quizId, id: quizId, status: "published", randomize: false, assignedTo: [learnerId] };
      persistedQuizCount += 1;
      releaseFirstCreate();
      const duplicate: any = new Error("duplicate finalization key");
      duplicate.code = 11000;
      throw duplicate;
    }, restores);
    patch(FormalQuizModel, "findOne", () => query(quizState), restores);
    patch(FormalQuizModel, "findById", () => query(quizState), restores);
    patch(CompetencyAssessmentModel, "findOneAndUpdate", (filter: any, update: any) => {
      if (filter.status && assessmentState.status !== filter.status) return query(null);
      Object.assign(assessmentState, update.$set || update);
      return query(assessmentState);
    }, restores);

    const [finalized, concurrentFinalized] = await Promise.all([
      finalizeCompetencyAssessment({ assessmentId, finalizedBy: facultyId }),
      finalizeCompetencyAssessment({ assessmentId, finalizedBy: facultyId })
    ]);
    assert.equal(finalized.quiz?._id, quizId);
    assert.equal(concurrentFinalized.quiz?._id, quizId);
    assert.equal(assessmentState.status, "in_progress");
    assert.equal(quizState.status, "published");
    assert.equal(typeof quizState.finalizationKey, "string");
    assert.equal(quizState.blueprintId, assessmentState.blueprintId);
    assert.equal(quizState.blueprintVersion, assessmentState.blueprintVersion);
    assert.equal(quizState.questionMetadata.length, 6);
    assert.equal(quizCreateCount, 2);
    assert.equal(persistedQuizCount, 1);

    const repeated = await finalizeCompetencyAssessment({ assessmentId, finalizedBy: facultyId });
    assert.equal(repeated.reused, true);
    assert.equal(repeated.quiz?._id, quizId);
    assert.equal(quizCreateCount, 2);

    patch(CompetencyAssessmentModel, "findOne", () => query(assessmentState), restores);
    const learnerQuizResponse = responseCapture();
    await getQuizForAttempt({ params: { id: quizId }, user } as any, learnerQuizResponse);
    assert.equal(learnerQuizResponse.result.statusCode, 200);
    assert.equal(learnerQuizResponse.result.body.questions.length, 6);
    assert.equal("correctAnswer" in learnerQuizResponse.result.body.questions[0], false);

    patch(FormalQuizAttemptModel, "create", async (input: any) => ({ ...input, _id: "64f000000000000000000099", id: "64f000000000000000000099" }), restores);
    patch(competencyService, "applyQuizCompetencyImpact", async () => ({ currentLevel: 3 }), restores);
    patch(competencyService, "recalculateSkillGaps", async () => { downstream.gaps += 1; }, restores);
    patch(competencyService, "updateCompetencyFromAssessment", async () => { downstream.evidence += 1; }, restores);
    patch(recommendationService, "generatePersonalizedLearningPath", async () => { downstream.recommendations += 1; }, restores);
    patch(performanceService, "recalculatePerformance", async () => { downstream.performance += 1; }, restores);
    patch(performanceService, "recordLearningActivity", async () => { downstream.activities += 1; }, restores);
    patch(learningOutcomeService, "recordLearningOutcome", async (input: any) => ({
      eventId: `test-${input.eventType}`,
      status: "recorded",
      eventType: input.eventType,
      userId: input.userId
    }), restores);
    patch(learningOutcomeCoordinator, "processLearningOutcome", async (eventId: string) => {
      downstream.gaps += 1;
      downstream.recommendations += 1;
      downstream.performance += 1;
      return {
        eventId,
        status: "processed",
        competencyUpdated: true,
        skillGapsRefreshed: true,
        recommendationsRefreshed: true,
        performanceRefreshed: true
      };
    }, restores);

    const completionResponse = responseCapture();
    await completeCompetencyAssessment({
      params: { id: assessmentId },
      body: { answers: questions.map((question) => ({ questionId: question._id, selected: "A", responseTimeMs: 5000 })) },
      user
    } as any, completionResponse);
    assert.equal(completionResponse.result.statusCode, 200);
    assert.equal(completionResponse.result.body.attempt.correctCount, 6);
    assert.equal(assessmentState.status, "completed");
    assert.equal(downstream.evidence, 2);
    assert.equal(downstream.gaps > 0, true);
    assert.equal(downstream.recommendations > 0, true);
    assert.equal(downstream.performance > 0, true);
    assert.equal(downstream.activities > 0, true);

    const duplicateCompletionResponse = responseCapture();
    await completeCompetencyAssessment({ params: { id: assessmentId }, body: { answers: [] }, user } as any, duplicateCompletionResponse);
    assert.equal(duplicateCompletionResponse.result.statusCode, 409);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
