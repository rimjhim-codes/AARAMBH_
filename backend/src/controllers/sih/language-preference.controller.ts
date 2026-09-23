import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import { getLearnerLanguagePreference, updateLearnerLanguagePreference } from "../../services/language-preference.service";
const updateSchema = z.object({ languageCode: z.string().min(2).max(10) }).strict();
export async function getMyLanguagePreference(req: AuthenticatedRequest, res: Response) { return res.json(await getLearnerLanguagePreference(req.user!.id)); }
export async function updateMyLanguagePreference(req: AuthenticatedRequest, res: Response) { const payload = updateSchema.parse(req.body); return res.json(await updateLearnerLanguagePreference(req.user!.id, payload.languageCode)); }
