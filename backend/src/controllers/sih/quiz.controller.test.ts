import assert from "node:assert/strict";
import test from "node:test";
import { canReviewQuestion, getQuizForAttempt, isTimedAssessmentExpired, listQuestionBank, questionReviewSchema } from "./quiz.controller";
import { CompetencyAssessmentModel, FormalQuizModel, SihQuestionModel } from "../../models/sih/SihModels";

function query<T>(value: T) {
  const result: any = {
    lean: async () => value,
    select: () => result,
    then: (resolve: (item: T) => unknown) => Promise.resolve(value).then(resolve)
  };
  return result;
}

function responseCapture() {
  const result: { statusCode: number; body?: unknown } = { statusCode: 200 };
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

test("question review authorization permits admins, question-owning faculty, and any faculty for pending_review questions", () => {
  const question = { createdBy: "faculty-1" };
  assert.equal(canReviewQuestion(question, { id: "faculty-1", role: "faculty" } as any), true);
  assert.equal(canReviewQuestion(question, { id: "faculty-2", role: "faculty" } as any), false);
  assert.equal(canReviewQuestion({ createdBy: "employee-1", status: "pending_review" }, { id: "faculty-2", role: "faculty" } as any), true);
  assert.equal(canReviewQuestion(question, { id: "admin-1", role: "admin" } as any), true);
  assert.equal(canReviewQuestion(question, { id: "employee-1", role: "employee" } as any), false);
});

test("question review requires feedback for rejection", () => {
  assert.throws(() => questionReviewSchema.parse({ status: "rejected", feedback: "no" }));
  assert.equal(questionReviewSchema.parse({ status: "rejected", feedback: "Distractors need revision." }).status, "rejected");
});

test("faculty review list is scoped to their own queue plus pending_review questions from any user", async () => {
  const restores: Array<() => void> = [];
  let filter: any;
  try {
    patch(SihQuestionModel, "find", (nextFilter: any) => {
      filter = nextFilter;
      return {
        sort: () => ({ limit: async () => [] })
      };
    }, restores);

    await listQuestionBank({ user: { id: "faculty-1", role: "faculty" } } as any, responseCapture());
    assert.deepEqual(filter, {
      $or: [
        { createdBy: "faculty-1", status: { $in: ["pending_review", "approved", "published"] } },
        { status: "pending_review" }
      ]
    });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("timed assessments expire server-side while unlimited legacy assessments do not", () => {
  const startedAt = new Date("2026-01-01T00:00:00.000Z");
  const afterLimit = startedAt.getTime() + 30 * 60_000 + 1;
  assert.equal(isTimedAssessmentExpired(startedAt, 30, afterLimit), true);
  assert.equal(isTimedAssessmentExpired(startedAt, undefined, afterLimit), false);
  assert.equal(isTimedAssessmentExpired(undefined, 30, afterLimit), false);
});

test("server refuses an expired timed competency assessment", async () => {
  const restores: Array<() => void> = [];
  let updated = false;
  try {
    patch(FormalQuizModel, "findById", () => query({
      _id: "64f000000000000000000001",
      createdBy: "faculty-1",
      status: "published",
      assignedTo: ["employee-1"],
      timeLimitEnabled: true,
      timeLimitMinutes: 5,
      questionIds: [],
      randomize: false
    }), restores);
    patch(CompetencyAssessmentModel, "findOne", () => query({
      _id: "64f000000000000000000002",
      status: "in_progress",
      startedAt: new Date(Date.now() - 6 * 60_000)
    }), restores);
    patch(CompetencyAssessmentModel, "findOneAndUpdate", () => {
      updated = true;
      return query(null);
    }, restores);
    const response = responseCapture();
    await getQuizForAttempt({
      params: { id: "64f000000000000000000001" },
      user: { id: "employee-1", role: "employee" }
    } as any, response);
    assert.equal(response.result.statusCode, 410);
    assert.equal(updated, true);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

