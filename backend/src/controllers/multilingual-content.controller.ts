import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middleware/auth";
import { transformLectureContent, MultilingualSourceNotFoundError } from "../services/multilingual-content.service";

const requestSchema = z.object({
  lectureId: z.string().min(1).max(100),
  mode: z.enum(["translate", "explain"]),
  targetLanguage: z.string().min(2).max(10).optional()
}).strict();

export async function transformMultilingualContent(req: AuthenticatedRequest, res: Response) {
  const payload = requestSchema.parse(req.body);
  try {
    const result = await transformLectureContent({
      userId: req.user!.id,
      lectureId: payload.lectureId,
      mode: payload.mode,
      targetLanguage: payload.targetLanguage
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof MultilingualSourceNotFoundError) return res.status(error.statusCode).json({ message: error.message });
    throw error;
  }
}
