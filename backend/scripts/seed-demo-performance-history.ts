/**
 * DEMO-ONLY utility for hackathon presentation purposes.
 * Never run this against real production user data.
 *
 * Usage:
 *   npx ts-node scripts/seed-demo-performance-history.ts --email demo.employee@example.com --confirm-demo-seed
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectDb } from "../src/config/db";
import { UserModel } from "../src/models/User";
import { PerformanceSnapshotModel } from "../src/models/sih/SihModels";

type Target = { kind: "email" | "user-id"; value: string };

function optionValues(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function numericOption(name: string, fallback: number): number {
  const value = optionValues(name)[0];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 90) {
    throw new Error(`${name} must be an integer between 2 and 90.`);
  }
  return parsed;
}

function targetsFromArgs(): Target[] {
  return [
    ...optionValues("--email").map((value) => ({ kind: "email" as const, value: value.toLowerCase().trim() })),
    ...optionValues("--user-id").map((value) => ({ kind: "user-id" as const, value: value.trim() }))
  ];
}

function bounded(value: number, minimum = 0, maximum = 100) {
  return Math.round(Math.max(minimum, Math.min(maximum, value)) * 10) / 10;
}

function metricAt(day: number, seed: number, base: number, slope: number, variance: number) {
  const wave = Math.sin((day + seed) * 0.63) * variance;
  const occasionalDip = day > 0 && day % (17 + (seed % 5)) === 0 ? -3.5 : 0;
  return bounded(base + slope * day + wave + occasionalDip);
}

function historyFor(seed: number, days: number) {
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return Array.from({ length: days }, (_, day) => {
    const capturedAt = new Date(start);
    capturedAt.setUTCDate(start.getUTCDate() + day);
    const overallLearningPercent = metricAt(day, seed, 36 + (seed % 9), 0.48, 2.2);
    const competencyAchievementPercent = metricAt(day, seed + 3, 29 + (seed % 8), 0.55, 2.8);
    const quizAveragePercentage = metricAt(day, seed + 7, 44 + (seed % 10), 0.42, 4.5);
    const learningHours = Math.max(0, Math.round((2 + day * 0.34 + Math.sin((day + seed) * 0.4) * 0.22) * 10) / 10);

    return { capturedAt, overallLearningPercent, competencyAchievementPercent, quizAveragePercentage, learningHours };
  });
}

async function resolveUsers(targets: Target[]) {
  const users: any[] = [];
  for (const target of targets) {
    const user = target.kind === "email"
      ? await UserModel.findOne({ email: target.value }).select("_id email role").lean()
      : await UserModel.findById(target.value).select("_id email role").lean();
    if (!user) throw new Error(`Target ${target.kind} '${target.value}' was not found.`);
    if (user.role !== "employee") throw new Error(`Target ${user.email} has role '${user.role}'. Only employee demo accounts are allowed.`);
    if (!users.some((item) => String(item._id) === String(user._id))) users.push(user);
  }
  return users;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run: demo seeding is disabled when NODE_ENV=production.");
  if (!process.argv.includes("--confirm-demo-seed")) throw new Error("Refusing to run: pass --confirm-demo-seed to write demo data.");
  const targets = targetsFromArgs();
  if (!targets.length) throw new Error("Provide at least one explicit --email or --user-id target.");
  const days = numericOption("--days", 75);

  await connectDb();
  const users = await resolveUsers(targets);
  const userIds = users.map((user) => user._id);
  console.warn("DEMO SEED: replacing PerformanceSnapshot data only for these employee accounts:");
  for (const user of users) console.warn(`  - ${user.email} (${user._id})`);
  console.warn(`DEMO SEED: ${days} historical entries per account; no other users or collections will be changed.`);

  await PerformanceSnapshotModel.deleteMany({ userId: { $in: userIds } });
  let created = 0;
  for (let index = 0; index < users.length; index += 1) {
    const user = users[index];
    const history = historyFor(index + 11, days);
    const latest = history[history.length - 1];
    const breakdown = {
      courseCompletion: bounded(latest.overallLearningPercent - 7),
      assessmentPerformance: latest.quizAveragePercentage,
      competencyAchievement: latest.competencyAchievementPercent,
      trainingCompletion: bounded(latest.overallLearningPercent - 12),
      quizPerformance: latest.quizAveragePercentage,
      learningHoursScore: bounded((latest.learningHours / 40) * 100)
    };
    await PerformanceSnapshotModel.create({
      userId: user._id,
      quizAttempts: Math.max(1, Math.floor(days / 8)),
      quizAveragePercentage: latest.quizAveragePercentage,
      assessmentAverage: latest.quizAveragePercentage,
      coursesCompleted: Math.floor(days / 30), coursesInProgress: 1,
      trainingCompleted: Math.floor(days / 45), learningHours: latest.learningHours,
      accuracy: bounded(latest.quizAveragePercentage - 4),
      competencyAchievementPercent: latest.competencyAchievementPercent,
      overallLearningPercent: latest.overallLearningPercent, breakdown, history,
      lastCalculatedAt: latest.capturedAt
    });
    created += 1;
  }
  console.log(`DEMO SEED COMPLETE: ${created} PerformanceSnapshot records created with ${days} history entries each.`);
}

main()
  .catch((error) => {
    console.error("Demo performance history seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => { await mongoose.disconnect().catch(() => undefined); });
