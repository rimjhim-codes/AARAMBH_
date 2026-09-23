import { Types } from "mongoose";
import { UserModel } from "../models/User";

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(key: string, delta: number): string {
  const d = new Date(key + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Update streak (UTC calendar days), XP, and study minutes.
 */
export async function recordStudyActivity(
  userId: Types.ObjectId | string,
  opts: { xpDelta?: number; minutesDelta?: number }
): Promise<{ xp: number; studyStreak: number; minutesStudiedTotal: number } | null> {
  const xpDelta = opts.xpDelta ?? 0;
  const minutesDelta = opts.minutesDelta ?? 0;
  if (!xpDelta && !minutesDelta) return null;

  const user = await UserModel.findById(userId);
  if (!user) return null;

  const today = utcDayKey(new Date());
  const lastRaw = user.lastStudyDay ? utcDayKey(new Date(user.lastStudyDay)) : null;

  let streak = user.studyStreak || 0;
  if (minutesDelta > 0 || xpDelta > 0) {
    if (!lastRaw) {
      streak = 1;
    } else if (lastRaw === today) {
      /* same day */
    } else if (lastRaw === addDays(today, -1)) {
      streak += 1;
    } else {
      streak = 1;
    }
  }

  const updated = await UserModel.findByIdAndUpdate(
    userId,
    {
      $inc: {
        xp: xpDelta,
        minutesStudiedTotal: minutesDelta
      },
      studyStreak: streak,
      lastStudyDay: new Date()
    },
    { new: true }
  ).lean();

  if (!updated) return null;
  return {
    xp: updated.xp,
    studyStreak: updated.studyStreak,
    minutesStudiedTotal: updated.minutesStudiedTotal ?? 0
  };
}
