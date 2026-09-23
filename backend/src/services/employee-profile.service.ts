import { EmployeeProfileModel } from "../models/sih/SihModels";

export async function ensureEmployeeProfileForUser(userId: string) {
  if (!userId) return null;

  const profile = await EmployeeProfileModel.findOneAndUpdate(
    { userId },
    { $set: { userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return profile;
}
