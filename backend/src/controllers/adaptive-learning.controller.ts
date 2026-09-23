import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middleware/auth";
import { getNextAdaptiveLearningDecision } from "../services/adaptive-learning.service";

const querySchema = z.object({ competencyId: z.string().trim().min(1).max(80).optional() });

export async function getNextAdaptiveLearning(req: AuthenticatedRequest, res: Response) {
  const query = querySchema.parse(req.query);
  const decision = await getNextAdaptiveLearningDecision(req.user!.id, query.competencyId);
  return res.json(decision);
}
