import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middleware/auth";
import { UserModel } from "../models/User";
import { recordStudyActivity } from "../utils/study-stats";
import { updateLectureProgress } from "../services/learning-progress.service";

const schema = z.object({
  seconds: z.number().min(1).max(7200),
  lectureId: z.string().min(1).optional(),
  courseCode: z.string().min(1).optional(),
  durationSec: z.number().positive().optional(),
  positionSec: z.number().min(0).optional()
});

/**
 * Client-reported watch segment (e.g. player heartbeat every 30s while tab focused).
 */
export async function reportWatchTime(req: AuthenticatedRequest, res: Response) {
  const { seconds, lectureId, courseCode, durationSec, positionSec } = schema.parse(req.body);
  await UserModel.updateOne({ _id: req.user!.id }, { $inc: { watchSecondsTotal: Math.floor(seconds) } });

  const minutesDelta = Math.floor(seconds / 60);
  let userStats = null;
  if (minutesDelta > 0) {
    userStats = await recordStudyActivity(req.user!.id, { minutesDelta, xpDelta: 0 });
  }

  const io = req.app.get("io") as import("socket.io").Server | undefined;
  if (userStats && io) {
    io.to(`user:${req.user!.id}`).emit("analytics:update", { userStats });
  }

  let progress = null;
  if (lectureId) {
    let resolvedCourseCode = courseCode;
    if (!resolvedCourseCode) {
      // Import at top level or inline to prevent circular dependency if needed. It's safe here.
      const { PlatformCourseModel } = require("../models/sih/SihModels");
      const course = await PlatformCourseModel.findOne({ lectureIds: lectureId, catalogType: "platform", isActive: true }).select("code").lean();
      if (course) resolvedCourseCode = course.code;
    }

    const progressPercent = durationSec
      ? Math.min(100, Math.round(((positionSec ?? 0) / durationSec) * 100))
      : 1;
    progress = await updateLectureProgress({
      userId: req.user!.id,
      resourceId: lectureId,
      source: "arambh",
      progressPercent,
      metadata: { courseCode: resolvedCourseCode, durationSec, positionSec, minutes: minutesDelta }
    });
  }

  return res.json({ ok: true, creditedMinutes: minutesDelta, progress });
}
