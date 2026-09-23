import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middleware/auth";
import { getLearnerPerformanceAnalytics } from "../services/learner-analytics.service";
import {
  getPlatformCourseEffectiveness,
  PlatformCourseNotFoundError
} from "../services/platform-course-effectiveness.service";
import { AnalyticsDateRangeError } from "../services/analytics-foundation.service";
import {
  getTrainingEffectiveness,
  TRAINING_EFFECTIVENESS_SOURCES,
  TrainingEffectivenessResourceNotFoundError
} from "../services/training-effectiveness.service";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  compare: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  comparisonDays: z.coerce.number().int().min(1).max(365).optional(),
  competencyId: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(250).optional()
});

export async function getLearnerAnalytics(req: AuthenticatedRequest, res: Response) {
  const query = querySchema.parse(req.query);
  const result = await getLearnerPerformanceAnalytics(req.user!.id, {
    ...query,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined
  });
  return res.json(result);
}

const courseEffectivenessQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional()
});

export async function getPlatformCourseEffectivenessController(req: AuthenticatedRequest, res: Response) {
  const query = courseEffectivenessQuerySchema.parse(req.query);
  const courseCode = z.string().trim().min(1).max(120).parse(req.params.code);
  try {
    const result = await getPlatformCourseEffectiveness(req.user!.id, courseCode, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof PlatformCourseNotFoundError) {
      return res.status(404).json({ message: error.message, code: "PLATFORM_COURSE_NOT_FOUND" });
    }
    if (error instanceof AnalyticsDateRangeError) {
      return res.status(400).json({ message: error.message, code: "INVALID_ANALYTICS_RANGE" });
    }
    throw error;
  }
}

const trainingEffectivenessParamsSchema = z.object({
  source: z.enum(TRAINING_EFFECTIVENESS_SOURCES),
  resourceId: z.string().trim().min(1).max(200)
});

const trainingEffectivenessQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional()
});

export async function getTrainingEffectivenessController(req: AuthenticatedRequest, res: Response) {
  const params = trainingEffectivenessParamsSchema.parse(req.params);
  const query = trainingEffectivenessQuerySchema.parse(req.query);
  try {
    const result = await getTrainingEffectiveness(req.user!.id, params.source, params.resourceId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof TrainingEffectivenessResourceNotFoundError) {
      return res.status(404).json({ message: error.message, code: "TRAINING_RESOURCE_NOT_FOUND" });
    }
    if (error instanceof AnalyticsDateRangeError) {
      return res.status(400).json({ message: error.message, code: "INVALID_ANALYTICS_RANGE" });
    }
    throw error;
  }
}
