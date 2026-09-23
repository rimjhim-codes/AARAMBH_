"use client";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { getHomeForRole } from "@/lib/routing";

export function MfaChallenge() {
  const [code, setCode] = useState("");
  const [isRecovery, setIsRecovery] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const setUser = useAppStore((s) => s.setUser);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (isRecovery) {
        const { data } = await api.post("/auth/mfa/recover", { recoveryCode: code });
        setUser(data.user);
        if (data.requiresRoleSelection || (data.user?.roles || []).length > 1) {
          router.push("/select-role");
        } else {
          router.push(getHomeForRole(data.user?.activeRole || data.user?.role));
        }
      } else {
        const { data } = await api.post("/auth/mfa/verify", { code });
        setUser(data.user);
        if (data.requiresRoleSelection || (data.user?.roles || []).length > 1) {
          router.push("/select-role");
        } else {
          router.push(getHomeForRole(data.user?.activeRole || data.user?.role));
        }
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Invalid code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-brand">
        <span className="auth-brand-mark">A</span>
        <div>
          <strong>ARAMBH</strong>
          <small>Official Statistics Capacity Platform</small>
        </div>
      </div>
      <div className="auth-layout">
        <div className="auth-context">
          <p className="eyebrow">SECURITY</p>
          <h1>Two-Factor Authentication</h1>
          <p>Protecting your learning and competency profile.</p>
        </div>
        <form onSubmit={onSubmit} className="auth-card">
          <p className="eyebrow">VERIFICATION</p>
          <h2>{isRecovery ? "Use Recovery Code" : "Enter Verification Code"}</h2>
          <p className="auth-subtitle">
            {isRecovery 
              ? "Enter one of your 8-character recovery codes." 
              : "Enter the 6-digit code from your authenticator app."}
          </p>
          <div className="auth-fields">
            <label className="auth-label">
              {isRecovery ? "Recovery code" : "Authentication code"}
              <input 
                required 
                className="auth-input" 
                placeholder={isRecovery ? "e.g. 1a2b3c4d" : "123456"} 
                value={code} 
                onChange={(e) => setCode(e.target.value)} 
                maxLength={isRecovery ? 8 : 6}
              />
            </label>
          </div>
          <button disabled={busy || (!isRecovery && code.length !== 6)} className="auth-submit">
            {busy ? "Verifying…" : "Verify"}
          </button>
          <div className="auth-links">
            <span 
              className="cursor-pointer underline" 
              onClick={() => { setIsRecovery(!isRecovery); setCode(""); setMessage(""); }}
            >
              {isRecovery ? "Use authenticator app" : "Use a recovery code"}
            </span>
          </div>
          {message && <p role="status" className="auth-message">{message}</p>}
        </form>
      </div>
    </main>
  );
}
