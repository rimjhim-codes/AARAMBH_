import { Resend } from "resend";
import { env } from "../config/env";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

function isResendRecipientRestriction(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    (lower.includes("only send") && lower.includes("testing") && lower.includes("email")) ||
    (lower.includes("only send") && lower.includes("own email address")) ||
    lower.includes("recipient is not verified") ||
    (lower.includes("sandbox") && lower.includes("recipient")) ||
    (lower.includes("testing") && lower.includes("recipient"))
  );
}

export async function sendResetPasswordEmail(email: string, otp: string) {
  if (!resend) {
    console.error("Password reset email delivery unavailable: RESEND_API_KEY is not configured");
    return { sent: false };
  }
  try {
    const result = await resend.emails.send({
      from: env.resendFrom,
      to: email,
      subject: "AARAMBH Password Reset OTP",
      html: `<p>Your password reset code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>This code expires in 10 minutes. If you did not request a password reset, please ignore this email.</p>`
    });
    if (result.error) throw new Error(result.error.message || "Resend rejected password reset email");
    return { sent: true };
  } catch (error) {
    if (isResendRecipientRestriction(error)) {
      if (env.devOtpConsole) {
        console.warn("[DEV ONLY OTP FALLBACK] Resend sandbox recipient restriction detected.");
        console.log(`[DEV OTP] email=${email} otp=${otp}`);
        return { sent: false, devConsoleFallback: true };
      }
      console.error(
        "Resend sandbox recipient restriction detected, but DEV_OTP_CONSOLE is disabled. Set DEV_OTP_CONSOLE=true for local development only."
      );
    }
    console.error("Password reset email delivery failed", {
      provider: "resend",
      email,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function sendVerificationEmail(email: string, code: string) {
  if (!resend) {
    console.error("Verification email delivery unavailable: RESEND_API_KEY is not configured");
    return { sent: false };
  }
  try {
    const result = await resend.emails.send({
      from: env.resendFrom,
      to: email,
      subject: "Verify your AARAMBH email",
      html: `<p>Your verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes.</p>`
    });
    if (result.error) throw new Error(result.error.message || "Resend rejected verification email");
    return { sent: true };
  } catch (error) {
    if (isResendRecipientRestriction(error)) {
      if (env.devOtpConsole) {
        console.warn("[DEV ONLY OTP FALLBACK] Resend sandbox recipient restriction detected.");
        console.log(`[DEV OTP] email=${email} otp=${code}`);
        return { sent: false, devConsoleFallback: true };
      }
      console.error(
        "Resend sandbox recipient restriction detected, but DEV_OTP_CONSOLE is disabled. Set DEV_OTP_CONSOLE=true for local development only."
      );
    }
    console.error("Verification email delivery failed", {
      provider: "resend",
      email,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
