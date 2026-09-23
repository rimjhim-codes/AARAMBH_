import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { USER_ROLES, UserRole } from "../types/roles";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  plan: "free" | "pro" | "institution";
  role: UserRole;
  roles?: UserRole[];
  activeRole?: UserRole;
  roleVersion: number;
  emailVerified: boolean;
  isActive: boolean;
  studyStreak: number;
  xp: number;
  minutesStudiedTotal: number;
  watchSecondsTotal: number;
  lastStudyDay?: Date;
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  emailVerificationCodeHash?: string;
  emailVerificationExpiresAt?: Date;
  emailVerificationAttempts: number;
  emailVerificationLastSentAt?: Date;
  emailVerificationLockedUntil?: Date;
  ssoProviderId?: string;
  ssoProvider?: string;
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaRecoveryCodes?: string[];
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    plan: { type: String, enum: ["free", "pro", "institution"], default: "free" },
    role: {
      type: String,
      enum: ["employee", "faculty", "admin"],
      default: "employee"
    },
    roles: [{ type: String, enum: USER_ROLES }],
    activeRole: { type: String, enum: USER_ROLES },
    roleVersion: { type: Number, default: 0 },
    emailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    studyStreak: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    minutesStudiedTotal: { type: Number, default: 0 },
    watchSecondsTotal: { type: Number, default: 0 },
    lastStudyDay: Date,
    resetTokenHash: String,
    resetTokenExpiresAt: Date,
    emailVerificationCodeHash: String,
    emailVerificationExpiresAt: Date,
    emailVerificationAttempts: { type: Number, default: 0 },
    emailVerificationLastSentAt: Date,
    emailVerificationLockedUntil: Date,
    ssoProviderId: { type: String, sparse: true },
    ssoProvider: String,
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: String,
    mfaRecoveryCodes: [String]
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = function comparePassword(password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

export const UserModel = mongoose.model<IUser>("User", UserSchema);
