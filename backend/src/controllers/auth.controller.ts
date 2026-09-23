import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { AuthenticatedRequest } from "../middleware/auth";
import { UserModel } from "../models/User";
import { sendResetPasswordEmail, sendVerificationEmail } from "../services/email.service";
import { createResetToken, hashToken } from "../utils/crypto";
import { signAccessToken, signRefreshToken } from "../utils/tokens";
import { IUser } from "../models/User";
import { RefreshTokenModel } from "../models/RefreshToken";
import { OtpThrottleModel } from "../models/OtpThrottle";
import { activeRoleFor, authorizedRoles } from "../services/role.service";
import { UserRole } from "../types/roles";
import { AuditLogModel } from "../models/sih/SihModels";
import { writeAuditLog } from "../services/audit-log.service";
import { ensureEmployeeProfileForUser } from "../services/employee-profile.service";
import { encryptMfaSecret, decryptMfaSecret, generateMfaSecret, generateMfaQrCode, verifyTotp, generateRecoveryCodes } from "../services/mfa.service";
import { getSsoClient, generateSsoAuthUrl } from "../services/sso.service";
import { TokenSet } from "openid-client";

const authSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8)
});
const emailOnlySchema = z.object({ email: z.string().email().transform((value) => value.trim().toLowerCase()) });
const verifyEmailSchema = emailOnlySchema.extend({ code: z.string().regex(/^\d{6}$/) });
const resetPasswordSchema = z.object({ resetToken: z.string().min(1), password: z.string().min(8), confirmPassword: z.string().min(8) }).refine((data) => data.password === data.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });
const verifyResetOtpSchema = emailOnlySchema.extend({ otp: z.string().regex(/^\d{6}$/) });
const roleSwitchSchema = z.object({ role: z.enum(["employee", "faculty", "admin"]) });

function createVerificationCode() {
  const code = String(randomInt(100000, 1000000));
  return { code, hash: hashToken(code) };
}

const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60_000;
const OTP_LOCKOUT_MS = 15 * 60_000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

function clientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function otpThrottleKey(email: string, ip: string, purpose: "verify" | "reset" = "verify") {
  return hashToken(`${email}|${ip}|${purpose}`);
}

function cookieOptions(maxAge: number, req: Request) {
  return {
    httpOnly: true,
    secure: env.nodeEnv === "production" && req.protocol === "https",
    sameSite: "strict" as const,
    maxAge,
    path: "/"
  };
}

function setAuthCookies(res: Response, req: Request, accessToken: string, refreshToken: string) {
  const accessOpts = cookieOptions(15 * 60_000, req);
  const refreshOpts = cookieOptions(REFRESH_MAX_AGE_MS, req);
  // Primary AARAMBH cookies + legacy NeuroLearn cookies for session continuity during rebrand.
  res.cookie("aarambh_access_token", accessToken, accessOpts);
  res.cookie("aarambh_refresh_token", refreshToken, refreshOpts);
  res.cookie("neurolearn_access_token", accessToken, accessOpts);
  res.cookie("neurolearn_refresh_token", refreshToken, refreshOpts);
}

function setAccessCookie(res: Response, req: Request, accessToken: string) {
  const accessOpts = cookieOptions(15 * 60_000, req);
  res.cookie("aarambh_access_token", accessToken, accessOpts);
  res.cookie("neurolearn_access_token", accessToken, accessOpts);
}

function clearAuthCookies(res: Response, req: Request) {
  const options = cookieOptions(0, req);
  res.clearCookie("aarambh_access_token", options);
  res.clearCookie("aarambh_refresh_token", options);
  res.clearCookie("neurolearn_access_token", options);
  res.clearCookie("neurolearn_refresh_token", options);
}

function readRefreshTokenCookie(req: Request) {
  return req.cookies?.aarambh_refresh_token || req.cookies?.neurolearn_refresh_token;
}

async function issueSession(res: Response, req: Request, user: IUser, familyId: string = randomUUID()) {
  const tokenId = randomUUID();
  const refreshToken = signRefreshToken(user.id, user.email, tokenId, familyId);
  const tokenHash = hashToken(refreshToken);
  await RefreshTokenModel.create({
    tokenHash,
    userId: user._id,
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS)
  });
  const accessToken = signAccessToken(user.id, user.email, activeRoleFor(user), user.roleVersion || 0);
  setAuthCookies(res, req, accessToken, refreshToken);
  return { tokenHash, familyId };
}

async function revokeRefreshFamily(familyId: string) {
  await RefreshTokenModel.updateMany(
    { familyId, revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
}

async function otpIsLocked(user: IUser, email: string, ip: string) {
  const now = new Date();
  if (user.emailVerificationLockedUntil && user.emailVerificationLockedUntil > now) return true;
  const throttle = await OtpThrottleModel.findOne({ key: otpThrottleKey(email, ip) }).lean();
  return Boolean(throttle?.lockedUntil && throttle.lockedUntil > now);
}

async function recordOtpFailure(user: IUser, email: string, ip: string) {
  const attempts = (user.emailVerificationAttempts || 0) + 1;
  user.emailVerificationAttempts = attempts;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    user.emailVerificationLockedUntil = new Date(Date.now() + OTP_LOCKOUT_MS);
  }
  await user.save();

  const key = otpThrottleKey(email, ip);
  const throttle = await OtpThrottleModel.findOneAndUpdate(
    { key },
    {
      key,
      email,
      ip,
      $inc: { failedAttempts: 1 },
      lastAttemptAt: new Date(),
      ...(attempts >= OTP_MAX_ATTEMPTS ? { lockedUntil: new Date(Date.now() + OTP_LOCKOUT_MS) } : {})
    },
    { upsert: true, new: true }
  );
  return Math.max(attempts, throttle?.failedAttempts || 0);
}

function isEmailVerified(user: Pick<IUser, "emailVerified">) {
  return user.emailVerified !== false;
}

function serializeUser(user: IUser | { _id?: unknown; id?: string; name: string; email: string; plan: string; role?: UserRole; roles?: UserRole[]; activeRole?: UserRole; emailVerified?: boolean; studyStreak?: number; xp?: number }) {
  const roles = authorizedRoles(user);
  const activeRole = activeRoleFor({ ...user, roles });
  return {
    id: String((user as IUser).id || (user as { _id?: unknown })._id),
    name: user.name,
    email: user.email,
    plan: user.plan,
    role: activeRole,
    roles,
    activeRole,
    emailVerified: user.emailVerified !== false,
    studyStreak: user.studyStreak ?? 0,
    xp: user.xp ?? 0,
    mfaEnabled: Boolean((user as IUser).mfaEnabled)
  };
}

export async function signup(req: Request, res: Response) {
  const payload = authSchema.extend({ name: z.string().min(2) }).parse(req.body);
  const existing = await UserModel.findOne({ email: payload.email });
  if (existing) return res.status(409).json({ message: "Email already in use" });

  const passwordHash = await bcrypt.hash(payload.password, 12);
  const { code, hash } = createVerificationCode();
  const user = await UserModel.create({
    name: payload.name,
    email: payload.email,
    passwordHash,
    role: "employee",
    roles: ["employee"],
    activeRole: "employee",
    emailVerified: false,
    emailVerificationCodeHash: hash,
    emailVerificationExpiresAt: new Date(Date.now() + 1000 * 60 * 10)
  });

  let emailResult: Awaited<ReturnType<typeof sendVerificationEmail>>;
  try {
    emailResult = await sendVerificationEmail(user.email, code);
  } catch (error) {
    await UserModel.deleteOne({ _id: user._id }).catch((cleanupError) => {
      console.error("Failed to roll back user after verification email failure", cleanupError);
    });
    return res.status(503).json({ message: "Verification email could not be sent. Please try again." });
  }

  if (!emailResult.sent && !emailResult.devConsoleFallback && !env.allowOtpPreview) {
    await UserModel.deleteOne({ _id: user._id });
    return res.status(503).json({ message: "Verification email is not configured. Please try again later." });
  }
  user.emailVerificationLastSentAt = new Date();
  user.emailVerificationAttempts = 0;
  await user.save();
  await ensureEmployeeProfileForUser(String(user._id));

  return res.status(201).json({
    user: serializeUser(user),
    requiresVerification: true,
    message: "Account created. Verify your email to continue.",
    ...(emailResult.sent || emailResult.devConsoleFallback || !env.allowOtpPreview
      ? {}
      : { verificationCode: code })
  });
}

export async function login(req: Request, res: Response) {
  const payload = authSchema.parse(req.body);
  const user = await UserModel.findOne({ email: payload.email });
  if (!user || user.isActive === false) {
    await writeAuditLog({ action: "auth.login.failure", resource: payload.email, meta: { reason: "invalid_credentials" }, req });
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const valid = await user.comparePassword(payload.password);
  if (!valid) {
    await writeAuditLog({ actorId: String(user._id), action: "auth.login.failure", resource: String(user._id), meta: { reason: "invalid_credentials" }, req });
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (!isEmailVerified(user)) {
    await writeAuditLog({ actorId: String(user._id), action: "auth.login.failure", resource: String(user._id), meta: { reason: "email_not_verified" }, req });
    return res.status(403).json({
      message: "Email not verified. Check your inbox or request a new code.",
      code: "EMAIL_NOT_VERIFIED",
      email: user.email
    });
  }

  // Removed redundant ensureEmployeeProfileForUser during login to save DB IOPS

  if (user.mfaEnabled) {
    const mfaTokenId = randomUUID();
    const mfaPendingToken = jwt.sign({ sub: user.id, mfa: true, jti: mfaTokenId }, env.jwtAccessSecret, { expiresIn: "5m" });
    res.cookie("mfa_pending_token", mfaPendingToken, cookieOptions(5 * 60_000, req));
    return res.json({ requiresMfa: true, message: "MFA challenge required" });
  }

  await issueSession(res, req, user);
  writeAuditLog({ actorId: String(user._id), action: "auth.login.success", resource: String(user._id), req }).catch((err) => console.error("Audit log error:", err));
  const roles = authorizedRoles(user);
  return res.json({ user: serializeUser(user), requiresRoleSelection: roles.length > 1 });
}

export async function verifyEmail(req: Request, res: Response) {
  const { email: normalizedEmail, code } = verifyEmailSchema.parse(req.body);
  const ip = clientIp(req);
  const user = await UserModel.findOne({ email: normalizedEmail });
  if (!user) return res.status(400).json({ message: "Invalid or expired verification code" });
  if (await otpIsLocked(user, normalizedEmail, ip)) {
    return res.status(429).json({ message: "Too many verification attempts. Request a new code later." });
  }

  const valid =
    user.emailVerificationCodeHash === hashToken(code) &&
    Boolean(user.emailVerificationExpiresAt && user.emailVerificationExpiresAt > new Date());
  if (!valid) {
    const attempts = await recordOtpFailure(user, normalizedEmail, ip);
    return res.status(attempts >= OTP_MAX_ATTEMPTS ? 429 : 400).json({
      message:
        attempts >= OTP_MAX_ATTEMPTS
          ? "Too many verification attempts. Request a new code later."
          : "Invalid or expired verification code"
    });
  }

  user.emailVerified = true;
  user.emailVerificationCodeHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  user.emailVerificationAttempts = 0;
  user.emailVerificationLastSentAt = undefined;
  user.emailVerificationLockedUntil = undefined;
  await user.save();
  await OtpThrottleModel.deleteOne({ key: otpThrottleKey(normalizedEmail, ip) });

  await ensureEmployeeProfileForUser(String(user._id));
  await issueSession(res, req, user);
  const roles = authorizedRoles(user);
  return res.json({ message: "Email verified successfully", user: serializeUser(user), requiresRoleSelection: roles.length > 1 });
}

export async function resendVerification(req: Request, res: Response) {
  const { email } = emailOnlySchema.parse(req.body);

  const user = await UserModel.findOne({ email });
  if (!user) {
    return res.json({ message: "If this email exists, a new verification code was sent." });
  }
  if (isEmailVerified(user)) {
    return res.json({ message: "Email is already verified." });
  }

  const ip = clientIp(req);
  if (await otpIsLocked(user, email, ip)) {
    return res.status(429).json({ message: "Verification is temporarily locked. Please try again later." });
  }
  if (
    user.emailVerificationLastSentAt &&
    Date.now() - user.emailVerificationLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    const retryAfter = Math.ceil(
      (OTP_RESEND_COOLDOWN_MS - (Date.now() - user.emailVerificationLastSentAt.getTime())) / 1000
    );
    return res.status(429).json({ message: `Please wait ${retryAfter}s before requesting another code.` });
  }

  const { code, hash } = createVerificationCode();
  let emailResult: Awaited<ReturnType<typeof sendVerificationEmail>>;
  try {
    emailResult = await sendVerificationEmail(user.email, code);
  } catch {
    return res.status(503).json({ message: "Verification email could not be sent. Please try again." });
  }
  if (!emailResult.sent && !emailResult.devConsoleFallback && !env.allowOtpPreview) {
    return res.status(503).json({ message: "Verification email is not configured. Please try again later." });
  }
  user.emailVerificationCodeHash = hash;
  user.emailVerificationExpiresAt = new Date(Date.now() + 1000 * 60 * 10);
  user.emailVerificationAttempts = 0;
  user.emailVerificationLastSentAt = new Date();
  user.emailVerificationLockedUntil = undefined;
  await user.save();
  return res.json({
    message: "Verification code sent",
    ...(emailResult.sent || emailResult.devConsoleFallback || !env.allowOtpPreview
      ? {}
      : { verificationCode: code })
  });
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = readRefreshTokenCookie(req);
  if (!refreshToken) {
    clearAuthCookies(res, req);
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as {
      sub: string;
      email: string;
      jti?: string;
      fid?: string;
    };
    if (!payload.jti || !payload.fid) throw new Error("Refresh token metadata missing");
    const tokenHash = hashToken(refreshToken);
    const stored = await RefreshTokenModel.findOne({ tokenHash });
    if (!stored) {
      await revokeRefreshFamily(payload.fid);
      clearAuthCookies(res, req);
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    if (stored.revokedAt || stored.usedAt || stored.familyId !== payload.fid) {
      await revokeRefreshFamily(stored.familyId);
      clearAuthCookies(res, req);
      return res.status(401).json({ message: "Refresh token reuse detected" });
    }
    if (stored.expiresAt <= new Date()) {
      await revokeRefreshFamily(stored.familyId);
      clearAuthCookies(res, req);
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    const user = await UserModel.findById(payload.sub);
    if (!user || user.isActive === false) {
      await revokeRefreshFamily(stored.familyId);
      clearAuthCookies(res, req);
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    const rotated = await RefreshTokenModel.findOneAndUpdate(
      { _id: stored._id, revokedAt: { $exists: false }, usedAt: { $exists: false } },
      { usedAt: new Date(), revokedAt: new Date() },
      { new: true }
    );
    if (!rotated) {
      await revokeRefreshFamily(stored.familyId);
      clearAuthCookies(res, req);
      return res.status(401).json({ message: "Refresh token reuse detected" });
    }
    const next = await issueSession(res, req, user, stored.familyId);
    await RefreshTokenModel.updateOne({ _id: stored._id }, { replacedByHash: next.tokenHash });
    return res.json({ user: serializeUser(user) });
  } catch {
    clearAuthCookies(res, req);
    return res.status(401).json({ message: "Invalid refresh token" });
  }
}

export async function switchRole(req: AuthenticatedRequest, res: Response) {
  console.log("[SWITCH-ROLE HANDLER V2 HIT]", { requestedRole: req.body?.role, userId: req.user?.id });
  const { role: requestedRole } = roleSwitchSchema.parse(req.body);
  const user = await UserModel.findById(req.user!.id);
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  const roles = authorizedRoles(user);
  if (!roles.includes(requestedRole)) return res.status(403).json({ message: "Role is not authorized for this account" });

  const previousRole = activeRoleFor(user);
  console.log("[SWITCH-ROLE BEFORE UPDATE]", {
    userId: user.id,
    roles,
    activeRole: user.activeRole,
    requestedRole,
    roleVersion: user.roleVersion
  });
  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: user._id, roles: requestedRole },
    {
      $set: { activeRole: requestedRole, role: requestedRole },
      $inc: { roleVersion: 1 }
    },
    { new: true, runValidators: true }
  );
  console.log("[SWITCH-ROLE AFTER UPDATE]", {
    userId: updatedUser?.id,
    activeRole: updatedUser?.activeRole,
    role: updatedUser?.role,
    roleVersion: updatedUser?.roleVersion
  });
  if (!updatedUser) return res.status(403).json({ message: "Role is not authorized for this account" });

  const activeRole = activeRoleFor(updatedUser);
  const accessToken = signAccessToken(updatedUser.id, updatedUser.email, activeRole, updatedUser.roleVersion);
  setAccessCookie(res, req, accessToken);
  await AuditLogModel.create({
    actorId: updatedUser._id,
    action: "user.role_switch",
    resource: updatedUser.id,
    meta: { from: previousRole, to: activeRole, roles: authorizedRoles(updatedUser) }
  });
  return res.json({ user: serializeUser(updatedUser) });
}

export async function logout(req: Request, res: Response) {
  const refreshToken = readRefreshTokenCookie(req);
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as { fid?: string };
      const stored = await RefreshTokenModel.findOne({ tokenHash: hashToken(refreshToken) }).lean();
      if (stored) await revokeRefreshFamily(stored.familyId);
      else if (payload.fid) await revokeRefreshFamily(payload.fid);
    } catch {
      // Logout remains idempotent even when the cookie is expired or malformed.
    }
  }
  clearAuthCookies(res, req);
  return res.status(204).send();
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = emailOnlySchema.parse(req.body);
  const ip = clientIp(req);
  const user = await UserModel.findOne({ email });
  if (!user) return res.json({ message: "If an account exists for this email, a verification code has been sent." });

  const throttle = await OtpThrottleModel.findOne({ key: otpThrottleKey(email, ip, "reset") }).lean();
  if (throttle?.lockedUntil && throttle.lockedUntil > new Date()) {
    return res.status(429).json({ message: "Too many reset attempts. Please try again later." });
  }
  if (throttle?.lastAttemptAt && Date.now() - throttle.lastAttemptAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return res.status(429).json({ message: "Please wait 60s before requesting another code." });
  }

  const { code, hash } = createVerificationCode();
  user.resetTokenHash = hash;
  user.resetTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 10);
  await user.save();

  await OtpThrottleModel.findOneAndUpdate(
    { key: otpThrottleKey(email, ip, "reset") },
    { key: otpThrottleKey(email, ip, "reset"), email, ip, lastAttemptAt: new Date() },
    { upsert: true }
  );

  let emailResult: Awaited<ReturnType<typeof sendResetPasswordEmail>>;
  try {
    emailResult = await sendResetPasswordEmail(user.email, code);
  } catch {
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();
    return res.status(503).json({ message: "Password reset email could not be sent. Please try again." });
  }

  if (!emailResult.sent && !emailResult.devConsoleFallback) {
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();
    return res.status(503).json({ message: "Password reset email is not configured. Please try again later." });
  }

  return res.json({ message: "If an account exists for this email, a verification code has been sent." });
}

export async function verifyResetOtp(req: Request, res: Response) {
  const { email, otp } = verifyResetOtpSchema.parse(req.body);
  const ip = clientIp(req);
  const user = await UserModel.findOne({ email });
  if (!user) return res.status(400).json({ message: "Invalid or expired OTP" });

  const throttleKey = otpThrottleKey(email, ip, "reset");
  const throttle = await OtpThrottleModel.findOne({ key: throttleKey }).lean();
  if (throttle?.lockedUntil && throttle.lockedUntil > new Date()) {
    return res.status(429).json({ message: "Too many attempts. Request a new code later." });
  }

  const valid =
    user.resetTokenHash === hashToken(otp) &&
    Boolean(user.resetTokenExpiresAt && user.resetTokenExpiresAt > new Date());

  if (!valid) {
    const attempts = (throttle?.failedAttempts || 0) + 1;
    await OtpThrottleModel.findOneAndUpdate(
      { key: throttleKey },
      {
        $set: { key: throttleKey, email, ip, lastAttemptAt: new Date() },
        $inc: { failedAttempts: 1 },
        ...(attempts >= OTP_MAX_ATTEMPTS ? { lockedUntil: new Date(Date.now() + OTP_LOCKOUT_MS) } : {})
      },
      { upsert: true }
    );
    return res.status(attempts >= OTP_MAX_ATTEMPTS ? 429 : 400).json({
      message: attempts >= OTP_MAX_ATTEMPTS ? "Too many attempts. Request a new code later." : "Invalid or expired OTP"
    });
  }

  user.resetTokenHash = undefined;
  user.resetTokenExpiresAt = undefined;
  await user.save();
  await OtpThrottleModel.deleteOne({ key: throttleKey });

  const resetToken = jwt.sign({ sub: user.id, purpose: "password_reset" }, env.jwtAccessSecret, { expiresIn: "10m" });
  return res.json({ resetToken, message: "OTP verified successfully." });
}

export async function resetPassword(req: Request, res: Response) {
  const { resetToken, password } = resetPasswordSchema.parse(req.body);

  let payload;
  try {
    payload = jwt.verify(resetToken, env.jwtAccessSecret) as { sub: string; purpose: string };
    if (payload.purpose !== "password_reset") throw new Error("Invalid token purpose");
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired reset session. Please request a new OTP." });
  }

  const user = await UserModel.findById(payload.sub);
  if (!user) return res.status(400).json({ message: "Invalid user." });

  user.passwordHash = await bcrypt.hash(password, 12);
  await user.save();

  return res.json({ message: "Password reset successfully" });
}

export async function me(req: AuthenticatedRequest, res: Response) {
  const user = await UserModel.findById(req.user?.id).select(
    "name email plan role roles activeRole emailVerified studyStreak xp mfaEnabled"
  );
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  const payload = serializeUser(user);
  setNoStoreHeaders(res);
  // Use end() instead of res.json() here so Express cannot generate an ETag
  // for this session response, even when ETags are enabled app-wide.
  return res.type("application/json").status(200).end(JSON.stringify(payload));
}

export function setNoStoreHeaders(res: Pick<Response, "setHeader">) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

export async function setupMfa(req: AuthenticatedRequest, res: Response) {
  const user = await UserModel.findById(req.user?.id);
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  if (user.mfaEnabled) return res.status(400).json({ message: "MFA is already enabled." });

  const secret = generateMfaSecret();
  const encryptedSecret = encryptMfaSecret(secret);
  const recoveryCodes = generateRecoveryCodes();
  const hashedRecoveryCodes = await Promise.all(recoveryCodes.map(code => bcrypt.hash(code, 10)));

  user.mfaSecret = encryptedSecret;
  user.mfaRecoveryCodes = hashedRecoveryCodes;
  await user.save();

  const { dataUrl } = await generateMfaQrCode(user.email, secret);
  return res.json({ qrCode: dataUrl, recoveryCodes, message: "MFA setup initialized." });
}

export async function enableMfa(req: AuthenticatedRequest, res: Response) {
  const { code } = z.object({ code: z.string().length(6) }).parse(req.body);
  const user = await UserModel.findById(req.user?.id);
  if (!user || !user.mfaSecret) return res.status(400).json({ message: "MFA setup not initialized." });

  const secret = decryptMfaSecret(user.mfaSecret);
  if (!verifyTotp(code, secret)) return res.status(400).json({ message: "Invalid verification code." });

  user.mfaEnabled = true;
  await user.save();
  return res.json({ message: "MFA enabled successfully." });
}

export async function disableMfa(req: AuthenticatedRequest, res: Response) {
  const { code } = z.object({ code: z.string().length(6) }).parse(req.body);
  const user = await UserModel.findById(req.user?.id);
  if (!user || !user.mfaEnabled || !user.mfaSecret) return res.status(400).json({ message: "MFA is not enabled." });

  const secret = decryptMfaSecret(user.mfaSecret);
  if (!verifyTotp(code, secret)) return res.status(400).json({ message: "Invalid verification code." });

  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  user.mfaRecoveryCodes = undefined;
  await user.save();
  return res.json({ message: "MFA disabled successfully." });
}

export async function verifyMfa(req: Request, res: Response) {
  const { code } = z.object({ code: z.string().length(6) }).parse(req.body);
  const pendingToken = req.cookies?.mfa_pending_token;
  if (!pendingToken) return res.status(401).json({ message: "MFA session expired." });

  try {
    const payload = jwt.verify(pendingToken, env.jwtAccessSecret) as { sub: string; mfa: boolean };
    const user = await UserModel.findById(payload.sub);
    if (!user || !user.mfaEnabled || !user.mfaSecret) throw new Error("Invalid user for MFA");

    const secret = decryptMfaSecret(user.mfaSecret);
    if (!verifyTotp(code, secret)) {
      await writeAuditLog({ actorId: String(user._id), action: "auth.mfa.failure", resource: String(user._id), req });
      return res.status(401).json({ message: "Invalid verification code." });
    }

    res.clearCookie("mfa_pending_token", cookieOptions(0, req));
    await issueSession(res, req, user);
    await writeAuditLog({ actorId: String(user._id), action: "auth.login.success", resource: String(user._id), req });
    const roles = authorizedRoles(user);
    return res.json({ user: serializeUser(user), requiresRoleSelection: roles.length > 1 });
  } catch (err) {
    res.clearCookie("mfa_pending_token", cookieOptions(0, req));
    return res.status(401).json({ message: "Invalid or expired MFA session." });
  }
}

export async function recoverMfa(req: Request, res: Response) {
  const { recoveryCode } = z.object({ recoveryCode: z.string().min(8) }).parse(req.body);
  const pendingToken = req.cookies?.mfa_pending_token;
  if (!pendingToken) return res.status(401).json({ message: "MFA session expired." });

  try {
    const payload = jwt.verify(pendingToken, env.jwtAccessSecret) as { sub: string; mfa: boolean };
    const user = await UserModel.findById(payload.sub);
    if (!user || !user.mfaEnabled || !user.mfaRecoveryCodes) throw new Error("Invalid user for MFA recovery");

    let matchedIndex = -1;
    for (let i = 0; i < user.mfaRecoveryCodes.length; i++) {
      if (await bcrypt.compare(recoveryCode, user.mfaRecoveryCodes[i])) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      await writeAuditLog({ actorId: String(user._id), action: "auth.mfa_recovery.failure", resource: String(user._id), req });
      return res.status(401).json({ message: "Invalid recovery code." });
    }

    // Consume recovery code
    user.mfaRecoveryCodes.splice(matchedIndex, 1);
    await user.save();

    res.clearCookie("mfa_pending_token", cookieOptions(0, req));
    await issueSession(res, req, user);
    await writeAuditLog({ actorId: String(user._id), action: "auth.login.success", resource: String(user._id), req });
    const roles = authorizedRoles(user);
    return res.json({ user: serializeUser(user), requiresRoleSelection: roles.length > 1 });
  } catch (err) {
    res.clearCookie("mfa_pending_token", cookieOptions(0, req));
    return res.status(401).json({ message: "Invalid or expired MFA session." });
  }
}

export async function ssoRedirect(req: Request, res: Response) {
  try {
    const ssoClient = await getSsoClient();
    const { url, state, nonce, code_verifier } = generateSsoAuthUrl(ssoClient);
    const opts = cookieOptions(5 * 60_000, req);
    res.cookie("sso_state", state, opts);
    res.cookie("sso_nonce", nonce, opts);
    res.cookie("sso_verifier", code_verifier, opts);
    return res.json({ redirectUrl: url });
  } catch (error: any) {
    return res.status(501).json({ message: error.message || "SSO configuration missing." });
  }
}

export async function ssoCallback(req: Request, res: Response) {
  try {
    const ssoClient = await getSsoClient();
    const params = ssoClient.callbackParams(req);
    const state = req.cookies?.sso_state;
    const nonce = req.cookies?.sso_nonce;
    const code_verifier = req.cookies?.sso_verifier;

    if (!state || !nonce || !code_verifier) {
      return res.status(400).redirect(env.clientUrl + "/login?error=sso_state_missing");
    }

    const tokenSet = await ssoClient.callback(env.ssoCallbackUrl, params, { state, nonce, code_verifier });
    const claims = tokenSet.claims();

    if (!claims.sub) throw new Error("Missing subject claim");
    const ssoProviderId = claims.sub;
    const email = (claims.email as string)?.trim().toLowerCase();
    if (!email) throw new Error("Missing email claim");

    // 1. Find by exact SSO identity linking
    let user = await UserModel.findOne({ ssoProviderId, ssoProvider: "keycloak" });
    
    // 2. Fallback to safe email linking if no SSO identity exists yet
    if (!user) {
      user = await UserModel.findOne({ email });
      if (user) {
        user.ssoProviderId = ssoProviderId;
        user.ssoProvider = "keycloak";
        // Auto-verify email since identity provider asserts it
        user.emailVerified = true; 
        await user.save();
      }
    }

    // 3. Create new account if neither found
    if (!user) {
      const passwordHash = await bcrypt.hash(randomUUID(), 12);
      user = await UserModel.create({
        name: claims.name || claims.preferred_username || email.split("@")[0],
        email,
        passwordHash, // Random unguessable password
        ssoProviderId,
        ssoProvider: "keycloak",
        role: "employee",
        roles: ["employee"],
        activeRole: "employee",
        emailVerified: true
      });
    }

    res.clearCookie("sso_state", cookieOptions(0, req));
    res.clearCookie("sso_nonce", cookieOptions(0, req));
    res.clearCookie("sso_verifier", cookieOptions(0, req));

    await ensureEmployeeProfileForUser(String(user._id));

    if (user.mfaEnabled) {
      const mfaTokenId = randomUUID();
      const mfaPendingToken = jwt.sign({ sub: user.id, mfa: true, jti: mfaTokenId }, env.jwtAccessSecret, { expiresIn: "5m" });
      res.cookie("mfa_pending_token", mfaPendingToken, cookieOptions(5 * 60_000, req));
      return res.redirect(env.clientUrl + "/mfa-challenge");
    }

    await issueSession(res, req, user);
    await writeAuditLog({ actorId: String(user._id), action: "auth.sso.success", resource: String(user._id), req });
    return res.redirect(env.clientUrl + "/dashboard");
  } catch (error: any) {
    console.error("SSO Callback Error:", error);
    res.clearCookie("sso_state", cookieOptions(0, req));
    res.clearCookie("sso_nonce", cookieOptions(0, req));
    res.clearCookie("sso_verifier", cookieOptions(0, req));
    return res.redirect(env.clientUrl + "/login?error=sso_failed");
  }
}
