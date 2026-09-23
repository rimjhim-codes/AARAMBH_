import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import { EmployeeProfileModel } from "../../models/sih/SihModels";
import { resolveLanguagePreference } from "../../config/languages";
import { generateTeacherAudio } from "../../services/tts.service";
import { requireLectureAiFeature } from "../../utils/educational-policy";

export async function generateTtsAudio(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    text: z.string().min(1),
    lectureId: z.string().optional() // Optional for general TTS, required if billing/access tracking is needed
  });
  
  const payload = schema.parse(req.body);

  if (payload.lectureId) {
    const ok = await requireLectureAiFeature(req, res, payload.lectureId, "live_assistant");
    if (!ok) return;
  }

  const profile = await EmployeeProfileModel.findOne({ userId: req.user!.id }).select("languagePreference").lean();
  const pref = resolveLanguagePreference(profile?.languagePreference || "en");

  try {
    const audioBase64 = await generateTeacherAudio(payload.text, pref.code);
    return res.json({ audioBase64 });
  } catch (error: any) {
    console.error("TTS generation error:", error);
    return res.status(503).json({ 
      message: error.message || "Failed to generate audio" 
    });
  }
}
