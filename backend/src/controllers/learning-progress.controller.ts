import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middleware/auth";
import { getLearningProgress, upsertLearningProgress, updateLectureProgress } from "../services/learning-progress.service";

const resourceTypes = ["platform_course", "lecture", "learning_material", "virtual_lab", "igot_course", "nssta_course", "training"] as const;

export async function getMyLearningProgress(req: AuthenticatedRequest, res: Response) {
  const resourceType = z.enum(resourceTypes).parse(req.params.resourceType);
  const progress = await getLearningProgress(req.user!.id, resourceType, String(req.params.resourceId));
  return res.json({ progress });
}

export async function updateMyLearningProgress(req: AuthenticatedRequest, res: Response) {
  const resourceType = z.enum(resourceTypes).parse(req.params.resourceType);
  const payload = z.object({
    progressPercent: z.number().min(0).max(100),
    status: z.enum(["not_started", "in_progress", "completed"]).optional(),
    source: z.enum(["arambh", "platform", "igot", "nssta", "system"]).default("arambh"),
    metadata: z.record(z.unknown()).optional()
  }).parse(req.body);
  if (["platform_course", "virtual_lab", "igot_course", "nssta_course", "training"].includes(resourceType)) {
    return res.status(400).json({ message: "This resource progress is updated by its enrollment or lab completion flow." });
  }
  if (resourceType === "lecture") {
    return res.json(await updateLectureProgress({
      userId: req.user!.id,
      resourceId: String(req.params.resourceId),
      ...payload
    }));
  }
  return res.json(await upsertLearningProgress({
    userId: req.user!.id,
    resourceType,
    resourceId: String(req.params.resourceId),
    ...payload
  }));
}
