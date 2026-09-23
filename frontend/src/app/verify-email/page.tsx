"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { getHomeForRole } from "@/lib/routing";
import { PageShell } from "@/components/sih/ui";

function VerifyContent() {
  const params = useSearchParams();
  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState(params.get("preview") || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/verify-email", { email, code });
      if (data.user) {
        setUser(data.user);
        setMessage("Email verified. Redirecting to your workspace…");
        if (data.requiresRoleSelection || (data.user?.roles || []).length > 1) router.push("/select-role" as never);
        else router.push(getHomeForRole(data.user?.activeRole || data.user?.role) as never);
        return;
      }
      setMessage("Email verified. You can now sign in.");
    } catch (reason: any) {
      setError(reason?.response?.data?.message || "Verification failed. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (secondsLeft > 0) return;
    setError("");
    try {
      const { data } = await api.post("/auth/resend-verification", { email });
      setMessage(data.message);
      if (data.verificationCode) {
        setCode(data.verificationCode);
      }
      setSecondsLeft(60);
    } catch (reason: any) {
      setError(reason?.response?.data?.message || "Could not resend verification code.");
    }
  }

  return (
    <PageShell title="Verify your email" subtitle="Enter the 6-digit code sent to your email. Codes expire after 10 minutes.">
      <form onSubmit={submit} className="auth-card auth-card-narrow">
        <input
          className="auth-input"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
        />
        <input
          className="auth-input tracking-[0.4em]"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="6-digit code"
        />
        <button disabled={loading} className="auth-submit">
          {loading ? "Verifying…" : "Verify email"}
        </button>
        <button
          type="button"
          disabled={secondsLeft > 0}
          onClick={resend}
          className="auth-link-button"
        >
          {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
        </button>
        {message ? <p className="auth-message auth-success">{message}</p> : null}
        {error ? <p className="auth-message auth-error">{error}</p> : null}
      </form>
    </PageShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<PageShell title="Verify your email" subtitle="Loading…" />}>
      <VerifyContent />
    </Suspense>
  );
}
