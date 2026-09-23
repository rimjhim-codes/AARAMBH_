import assert from "node:assert/strict";
import test from "node:test";
import { LectureModel } from "../models/Lecture";
import { PlatformCourseModel } from "../models/sih/SihModels";
import { resolveAuthorizedLecture } from "./educational-policy";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function query<T>(value: T) {
  const chain: any = {
    select: () => chain,
    lean: async () => value
  };
  return chain;
}

function request() {
  return { user: { id: "employee-1" } } as any;
}

test("employee can resolve a processed lecture attached to an active platform course", async () => {
  const restores: Array<() => void> = [];
  const platformLecture = { _id: "lecture-1", status: "processed", title: "Sampling" } as any;
  let ownedLookup = 0;
  try {
    patch(LectureModel, "findOne", async (filter: any) => {
      ownedLookup += 1;
      return ownedLookup === 1 ? null : platformLecture;
    }, restores);
    patch(PlatformCourseModel, "findOne", (filter: any) => {
      assert.deepEqual(filter, { lectureIds: "lecture-1", catalogType: "platform", isActive: true });
      return query({ _id: "course-1" });
    }, restores);

    const result = await resolveAuthorizedLecture(request(), "lecture-1");
    assert.equal(result, platformLecture);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("unrelated lecture IDs remain unauthorized", async () => {
  const restores: Array<() => void> = [];
  try {
    patch(LectureModel, "findOne", async () => null, restores);
    patch(PlatformCourseModel, "findOne", () => query(null), restores);
    assert.equal(await resolveAuthorizedLecture(request(), "unrelated-lecture"), null);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("learner-owned lectures remain authorized without a platform-course lookup", async () => {
  const restores: Array<() => void> = [];
  let courseLookups = 0;
  const ownedLecture = { _id: "owned-lecture", userId: "employee-1", status: "uploaded" } as any;
  try {
    patch(LectureModel, "findOne", async () => ownedLecture, restores);
    patch(PlatformCourseModel, "findOne", () => { courseLookups += 1; return query(null); }, restores);
    assert.equal(await resolveAuthorizedLecture(request(), "owned-lecture"), ownedLecture);
    assert.equal(courseLookups, 0);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
