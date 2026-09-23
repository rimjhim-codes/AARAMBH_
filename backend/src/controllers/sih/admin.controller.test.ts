import assert from "node:assert/strict";
import test from "node:test";
import { upsertRoleRequirement } from "./admin.controller";
import * as models from "../../models/sih/SihModels";
import * as frameworkModule from "../../services/framework.service";
import * as auditModule from "../../services/audit-log.service";

type AnyFunction = (...args: any[]) => any;

function patch(target: object, key: string, value: AnyFunction): () => void {
  const original = (target as any)[key];
  (target as any)[key] = value;
  return () => { (target as any)[key] = original; };
}

test("role requirement upsert writes an audit entry with before and after context", async () => {
  const restores: Array<() => void> = [];
  const auditCalls: any[] = [];
  const response = { body: undefined as any, json(body: any) { this.body = body; return this; }, status() { return this; } };
  const request = {
    user: { id: "admin-1" },
    body: { jobRole: "Statistical Officer", competencyId: "comp-1", requiredLevel: 4 }
  } as any;
  const existing = { _id: "requirement-1", jobRole: "Statistical Officer", competencyId: "comp-1", requiredLevel: 3 };
  const saved = { ...existing, requiredLevel: 4, _id: "requirement-1" };

  restores.push(patch(frameworkModule, "getLegacyFrameworkVersion", async () => ({ _id: "framework-1" })));
  restores.push(patch(models.FrameworkVersionModel, "findById", () => ({ select: () => ({ lean: async () => ({ status: "draft", frameworkId: "framework", version: "1.0" }) }) })));
  restores.push(patch(models.CompetencyModel, "findOne", () => ({ select: async () => ({ _id: "comp-1" }) })));
  restores.push(patch(models.RoleRequirementModel, "findOne", () => ({ lean: async () => existing })));
  restores.push(patch(models.RoleRequirementModel, "findOneAndUpdate", async () => saved));
  restores.push(patch(auditModule, "writeAuditLog", async (input: any) => { auditCalls.push(input); }));

  try {
    await upsertRoleRequirement(request, response as any);
    assert.equal(response.body.requirement, saved);
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].actorId, "admin-1");
    assert.equal(auditCalls[0].action, "role_requirement.upsert");
    assert.equal(auditCalls[0].resource, "requirement-1");
    assert.equal(auditCalls[0].meta.operation, "update");
    assert.equal(auditCalls[0].meta.before.requiredLevel, 3);
    assert.equal(auditCalls[0].meta.after.requiredLevel, 4);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
