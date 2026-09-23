import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import { EmployeeProfileModel } from "../../models/sih/SihModels";
import {
  bootstrapCompetencyScoresFromProfile,
  computeProfileCompleteness,
  recalculateSkillGaps
} from "../../services/competency.service";
import { generatePersonalizedLearningPath } from "../../services/recommendation.service";
import { recalculatePerformance } from "../../services/performance.service";
import { AuditLogModel } from "../../models/sih/SihModels";
import { isSelectableLanguage, normalizeLanguageCode } from "../../config/languages";

const profileSchema = z.object({
  employeeId: z.string().optional(),
  department: z.string().optional(),
  organization: z.string().optional(),
  designation: z.string().optional(),
  jobRole: z.string().optional(),
  currentAssignment: z.string().optional(),
  educationalQualification: z.string().optional(),
  degree: z.string().optional(),
  specialization: z.string().optional(),
  yearsOfExperience: z.number().min(0).max(50).optional(),
  previousTrainings: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  currentSkills: z.array(z.string()).optional(),
  desiredCareerRole: z.string().optional(),
  futureSkillInterests: z.array(z.string()).optional(),
  languagePreference: z.string().refine(isSelectableLanguage, "Only currently supported languages can be selected.").transform(normalizeLanguageCode).optional()
});

export async function getMyProfile(req: AuthenticatedRequest, res: Response) {
  const profile = await EmployeeProfileModel.findOne({ userId: req.user!.id });
  return res.json({ profile });
}

export async function upsertMyProfile(req: AuthenticatedRequest, res: Response) {
  const payload = profileSchema.parse(req.body);
  if (process.env.DEBUG_SKILL_GAPS === "true") {
    console.log("[SKILL-GAPS DEBUG] profile save payload", JSON.stringify({
      userId: req.user!.id,
      currentSkills: payload.currentSkills,
      previousTrainings: payload.previousTrainings
    }));
  }
  const completeness = computeProfileCompleteness(payload as Record<string, unknown>);

  const profile = await EmployeeProfileModel.findOneAndUpdate(
    { userId: req.user!.id },
    { userId: req.user!.id, ...payload, profileCompleteness: completeness },
    { upsert: true, new: true }
  );

  if (process.env.DEBUG_SKILL_GAPS === "true") {
    console.log("[SKILL-GAPS DEBUG] stored EmployeeProfile after save", JSON.stringify({
      userId: req.user!.id,
      currentSkills: profile?.currentSkills,
      previousTrainings: profile?.previousTrainings
    }));
  }

  await bootstrapCompetencyScoresFromProfile(req.user!.id);
  await recalculateSkillGaps(req.user!.id);
  await Promise.all([
    generatePersonalizedLearningPath(req.user!.id),
    recalculatePerformance(req.user!.id)
  ]);

  await AuditLogModel.create({
    actorId: req.user!.id,
    action: "profile.upsert",
    resource: "EmployeeProfile",
    meta: { completeness }
  });

  return res.json({ profile, message: "Profile saved. Competency profile refreshed from evidence." });
}
