import assert from "node:assert/strict";
import test from "node:test";
import * as organizationAnalyticsService from "../services/organization-analytics.service";
import { AnalyticsDateRangeError } from "../services/analytics-foundation.service";
import {
  getDepartmentAnalyticsByIdController,
  getOrganizationAnalyticsController
} from "./organization-analytics.controller";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "admin-1", roles: ["admin"] },
    query: {},
    params: {},
    ...overrides
  } as any;
}

test("organization analytics controller uses authenticated role scope and stable response", async () => {
  const restores: Array<() => void> = [];
  let received: any;
  patch(organizationAnalyticsService, "getOrganizationAnalytics", async (...args: any[]) => {
    received = args;
    return { scope: { type: args[1] }, summary: {}, limitations: [] };
  }, restores);
  try {
    const res = response();
    await getOrganizationAnalyticsController(request({ query: { userId: "other-user", limit: "10" } }), res as any);
    assert.equal(received[0].userId, "admin-1");
    assert.deepEqual(received[0].roles, ["admin"]);
    assert.equal(received[2].userId, undefined);
    assert.equal(received[2].limit, 10);
    assert.deepEqual(res.body, { scope: { type: "organization" }, summary: {}, limitations: [] });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("organization analytics controller maps authorization and date failures", async () => {
  const restores: Array<() => void> = [];
  patch(organizationAnalyticsService, "getOrganizationAnalytics", async () => {
    throw new organizationAnalyticsService.OrganizationAnalyticsForbiddenError("Forbidden.");
  }, restores);
  try {
    const forbidden = response();
    await getDepartmentAnalyticsByIdController(request({ user: { id: "employee-1", roles: ["employee"] }, params: { departmentId: "Engineering" } }), forbidden as any);
    assert.equal(forbidden.statusCode, 403);
    assert.deepEqual(forbidden.body, { message: "Forbidden.", code: "ORGANIZATION_ANALYTICS_FORBIDDEN" });

    patch(organizationAnalyticsService, "getOrganizationAnalytics", async () => {
      throw new AnalyticsDateRangeError("Invalid analytics date range.");
    }, restores);
    const invalid = response();
    await getOrganizationAnalyticsController(request(), invalid as any);
    assert.equal(invalid.statusCode, 400);
    assert.deepEqual(invalid.body, { message: "Invalid analytics date range.", code: "INVALID_ANALYTICS_RANGE" });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
