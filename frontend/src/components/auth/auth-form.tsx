"use client";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { getHomeForRole } from "@/lib/routing";
type Mode = "login" | "signup" | "forgot" | "reset";
const copy: Record<Mode, { title: string; subtitle: string; action: string }> = {
  login: { title: "Welcome back", subtitle: "Sign in to continue your ARAMBH capability journey.", action: "Sign in" },
  signup: { title: "Create your account", subtitle: "Start building a clearer, evidence-led learning path.", action: "Create account" },
  forgot: { title: "Reset your password", subtitle: "We will send a verification code to your registered email address.", action: "Send instructions" },
  reset: { title: "Choose a new password", subtitle: "Use the reset token from your email to continue.", action: "Reset password" }
};
export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const setUser = useAppStore((s) => s.setUser);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const { data } = await api.post("/auth/login", { email, password });
        if (data.requiresMfa) {
          router.push("/mfa-challenge" as never);
          return;
        }
        setUser(data.user);
        setMessage("Logged in successfully");
        if (data.requiresRoleSelection || (data.user?.roles || []).length > 1) router.push("/select-role" as never);
        else router.push(getHomeForRole(data.user?.activeRole || data.user?.role) as never);
      }
      if (mode === "signup") {
        const { data } = await api.post("/auth/signup", { name, email, password });
        setMessage(data.message || "Account created. Verify your email to continue.");
        const verifyUrl = `/verify-email?email=${encodeURIComponent(email)}`;
        if (data.verificationCode) router.push(`${verifyUrl}&preview=${data.verificationCode}` as never);
        else router.push(verifyUrl as never);
      }
      if (mode === "forgot") {
        if (step === 1) {
          const { data } = await api.post("/auth/forgot-password", { email });
          setMessage(data.message || "OTP sent");
          setStep(2);
        } else if (step === 2) {
          const { data } = await api.post("/auth/verify-reset-otp", { email, otp });
          setResetToken(data.resetToken);
          setMessage("");
          setStep(3);
        } else if (step === 3) {
          if (password !== confirmPassword) {
            setMessage("Passwords do not match");
            setBusy(false);
            return;
          }
          const { data } = await api.post("/auth/reset-password", { resetToken, password, confirmPassword });
          setMessage(data.message || "Password reset successfully");
          setStep(4);
        }
      }
      if (mode === "reset") {
        const { data } = await api.post("/auth/reset-password", { token, password });
        setMessage(data.message || "Password reset complete");
      }
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === "EMAIL_NOT_VERIFIED") {
        const verifyEmail = err?.response?.data?.email || email;
        setMessage("Verify your email before signing in.");
        router.push(`/verify-email?email=${encodeURIComponent(verifyEmail)}` as never);
      } else setMessage(err?.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onResendOtp() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setMessage(data.message || "OTP resent");
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Failed to resend OTP. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  async function onSsoClick(e: any) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.get("/auth/sso");
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setMessage("Invalid SSO response.");
        setBusy(false);
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "SSO initiation failed. Please try again.");
      setBusy(false);
    }
  }

  const labels = copy[mode];
  
  let actionText = labels.action;
  let titleText = labels.title;
  let subtitleText = labels.subtitle;
  if (mode === "forgot") {
    if (step === 1) {
      actionText = "Send OTP";
    } else if (step === 2) {
      titleText = "Verify OTP";
      subtitleText = "Enter the 6-digit code sent to your email.";
      actionText = "Verify OTP";
    } else if (step === 3) {
      titleText = "Set New Password";
      subtitleText = "Enter your new password below.";
      actionText = "Reset Password";
    } else if (step === 4) {
      titleText = "Password reset successfully";
      subtitleText = "You can now sign in with your new password.";
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-brand">
        <span className="auth-brand-mark">A</span>
        <div><strong>ARAMBH</strong><small>Official Statistics Capacity Platform</small></div>
      </div>
      <div className="auth-layout">
        <div className="auth-context">
          <p className="eyebrow">ASSESS · ADAPT · ADVANCE</p>
          <h1>Build capability with clarity.</h1>
          <p>Assess your strengths, understand your gaps and follow a learning path grounded in your evidence.</p>
          <div className="auth-context-rule" />
          <span>Government · Enterprise · Workforce intelligence</span>
        </div>
        <form onSubmit={onSubmit} className="auth-card">
          <p className="eyebrow">OFFICIAL STATISTICS</p>
          <h2>{titleText}</h2>
          <p className="auth-subtitle">{subtitleText}</p>
          {(mode === "login" || mode === "signup") && (
            <div className="mb-4">
              <button type="button" onClick={onSsoClick} disabled={busy} className="sih-button-secondary flex w-full items-center justify-center gap-2">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
                Continue with SSO
              </button>
              <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
                <div className="h-px flex-1 bg-zinc-800"></div>
                <span>or continue with email</span>
                <div className="h-px flex-1 bg-zinc-800"></div>
              </div>
            </div>
          )}
          <div className="auth-fields">
            {(mode === "signup" || mode === "login" || (mode === "forgot" && step === 1)) && (
              <label className="auth-label">
                Email
                <input required type="email" autoComplete="email" className="auth-input" placeholder="name@department.gov.in" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            )}
            {mode === "forgot" && step === 2 && (
              <label className="auth-label">
                6-digit OTP
                <input required type="text" maxLength={6} className="auth-input text-center text-xl tracking-[0.25em]" placeholder="------" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
              </label>
            )}
            {mode === "signup" && (
              <label className="auth-label">
                Full name
                <input required className="auth-input" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            )}
            {(mode === "login" || mode === "signup" || mode === "reset" || (mode === "forgot" && step === 3)) && (
              <label className="auth-label">
                Password
                <div className="auth-password">
                  <input required type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} className="auth-input" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="password-toggle">{showPassword ? "Hide" : "Show"}</button>
                </div>
              </label>
            )}
            {(mode === "forgot" && step === 3) && (
              <label className="auth-label">
                Confirm Password
                <div className="auth-password">
                  <input required type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" className="auth-input" placeholder="Confirm your new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="password-toggle">{showConfirmPassword ? "Hide" : "Show"}</button>
                </div>
              </label>
            )}
            {mode === "reset" && (
              <label className="auth-label">
                Reset token
                <input required className="auth-input" placeholder="Paste your reset token" value={token} onChange={(e) => setToken(e.target.value)} />
              </label>
            )}
          </div>

          {!(mode === "forgot" && step === 4) && (
            <button disabled={busy} className="auth-submit">{busy ? "Working…" : actionText}</button>
          )}

          {mode === "forgot" && step === 2 && (
            <div className="mt-4 text-center">
              <button type="button" disabled={busy} onClick={onResendOtp} className="text-sm text-zinc-400 hover:text-white transition-colors">
                Didn't receive the code? Resend
              </button>
            </div>
          )}

          {mode === "forgot" && step === 4 && (
            <a href="/login" className="auth-submit block text-center" style={{ textDecoration: 'none' }}>Back to Login</a>
          )}

          {mode === "login" ? (
            <div className="auth-links">
              <a href="/forgot-password">Forgot password?</a>
              <span>New to ARAMBH? <a href="/signup">Create account</a></span>
            </div>
          ) : null}
          {mode === "signup" ? (
            <div className="auth-links">
              <span>Already registered? <a href="/login">Sign in</a></span>
            </div>
          ) : null}
          
          {message && step !== 4 && (
            <p role="status" className="auth-message">{message}</p>
          )}
        </form>
      </div>
      <p className="auth-footer">Secure access to your authorized ARAMBH workspace.</p>
    </main>
  );
}
