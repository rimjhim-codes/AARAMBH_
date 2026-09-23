import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { UserModel } from "../models/User";

const PLAN_FEATURES = {
  free: ["basic lectures", "basic quizzes", "basic progress"],
  pro: ["advanced AI tutor", "summaries", "flashcards", "smart revision", "advanced analytics"],
  institution: ["employee competency assessment", "skill-gap analysis", "training assignments", "organization analytics", "admin reports"]
} as const;

export async function getPlanEntitlements(req: AuthenticatedRequest, res: Response) {
  const user = await UserModel.findById(req.user!.id).select("plan").lean();
  const plan = user?.plan || "free";
  return res.json({
    currentPlan: plan,
    features: PLAN_FEATURES[plan],
    availablePlans: Object.entries(PLAN_FEATURES).map(([name, features]) => ({ name, features })),
    upgradeAvailable: plan !== "institution",
    paymentStatus: "not_configured"
  });
}
