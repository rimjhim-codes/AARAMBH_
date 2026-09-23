import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middleware/auth";
import { AnalyticsDateRangeError } from "../services/analytics-foundation.service";
import {
  getOrganizationAnalytics,
  OrganizationAnalyticsForbiddenError,
  type OrganizationAnalyticsScope
} from "../services/organization-analytics.service";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  department: z.string().trim().min(1).max(120).optional(),
  role: z.string().trim().min(1).max(120).optional(),
  competencyId: z.string().trim().min(1).max(100).optional(),
  domain: z.string().trim().min(1).max(100).optional(),
  source: z.enum(["platform", "igot", "nssta", "training", "quiz", "assessment", "virtual_lab"]).optional(),
  status: z.string().trim().min(1).max(30).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const dimensionSchema = z.string().trim().min(1).max(120);

function requester(req: AuthenticatedRequest) {
  return {
    userId: req.user!.id,
    roles: req.user!.roles || [req.user!.activeRole || req.user!.role]
  };
}

function queryOf(req: AuthenticatedRequest) {
  const parsed = querySchema.parse(req.query);
  return {
    ...parsed,
    from: parsed.from ? new Date(parsed.from) : undefined,
    to: parsed.to ? new Date(parsed.to) : undefined
  };
}

async function send(scope: OrganizationAnalyticsScope, req: AuthenticatedRequest, res: Response, forced?: Record<string, string>) {
  try {
    const result = await getOrganizationAnalytics(requester(req), scope, { ...queryOf(req), ...forced });
    return res.json(result);
  } catch (error) {
    if (error instanceof OrganizationAnalyticsForbiddenError) {
      return res.status(403).json({ message: error.message, code: "ORGANIZATION_ANALYTICS_FORBIDDEN" });
    }
    if (error instanceof AnalyticsDateRangeError) {
      return res.status(400).json({ message: error.message, code: "INVALID_ANALYTICS_RANGE" });
    }
    throw error;
  }
}

export async function getOrganizationAnalyticsController(req: AuthenticatedRequest, res: Response) {
  return send("organization", req, res);
}

export async function getDepartmentAnalyticsController(req: AuthenticatedRequest, res: Response) {
  return send("department", req, res);
}

export async function getDepartmentAnalyticsByIdController(req: AuthenticatedRequest, res: Response) {
  const department = dimensionSchema.parse(req.params.departmentId);
  return send("department", req, res, { department });
}

export async function getRoleAnalyticsController(req: AuthenticatedRequest, res: Response) {
  return send("role", req, res);
}

export async function getRoleAnalyticsByIdController(req: AuthenticatedRequest, res: Response) {
  const role = dimensionSchema.parse(req.params.roleId);
  return send("role", req, res, { role });
}
