import assert from "node:assert/strict";
import test from "node:test";
import { facultyAccessRequestSchema, interviewTrackingSchema, reviewRoleRequestSchema } from "./role-request.controller";

test("faculty access request requires useful designation and justification", () => {
  assert.throws(() => facultyAccessRequestSchema.parse({ designation: "", justification: "not enough" }));
  assert.deepEqual(facultyAccessRequestSchema.parse({
    designation: "Deputy Director",
    justification: "I have led official statistics training for regional teams.",
    experienceNotes: "Advanced sampling certification"
  }), {
    designation: "Deputy Director",
    justification: "I have led official statistics training for regional teams.",
    experienceNotes: "Advanced sampling certification"
  });
});

test("rejection review requires a reason", () => {
  assert.throws(() => reviewRoleRequestSchema.parse({ status: "rejected" }));
  assert.equal(reviewRoleRequestSchema.parse({ status: "rejected", rejectionReason: "Please add relevant training evidence." }).status, "rejected");
  assert.equal(reviewRoleRequestSchema.parse({ status: "approved" }).rejectionReason, "");
});

test("interview tracking accepts a checkbox and optional notes", () => {
  assert.deepEqual(interviewTrackingSchema.parse({ interviewConducted: true, interviewNotes: "Interviewed and verified training history." }), {
    interviewConducted: true,
    interviewNotes: "Interviewed and verified training history."
  });
});
