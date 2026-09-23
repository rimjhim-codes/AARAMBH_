import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middleware/auth";
import { HISTORY_SOURCES, getUnifiedLearningHistory } from "../services/learning-history.service";

const querySchema = z.object({
  source: z.enum(HISTORY_SOURCES).optional(),
  resourceType: z.string().trim().min(1).max(80).optional(),
  status: z.string().trim().min(1).max(40).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional()
});

export async function getMyLearningHistory(req: AuthenticatedRequest, res: Response) {
  const query = querySchema.parse(req.query);
  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;
  if (from && to && from > to) return res.status(400).json({ message: "The history start date must be before the end date." });
  const result = await getUnifiedLearningHistory(req.user!.id, { ...query, from, to });
  return res.json(result);
}
