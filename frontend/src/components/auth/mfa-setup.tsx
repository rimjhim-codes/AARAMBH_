/*"use client";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export function MfaSetup() {
  const [status, setStatus] = useState<"idle" | "setup" | "enabled">("idle");
  const [qrCode, setQrCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  async function startSetup() {
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.post("/auth/mfa/setup");
      setQrCode(data.qrCode);
      setRecoveryCodes(data.recoveryCodes);
      setStatus("setup");
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Could not start MFA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function enableMfa(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api.post("/auth/mfa/enable", { code });
      setStatus("enabled");
      setMessage("MFA enabled successfully.");
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Invalid code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api.post("/auth/mfa/disable", { code: disableCode });
      setStatus("idle");
      setMessage("MFA disabled successfully.");
      setDisableCode("");
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Invalid code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sih-panel space-y-6 p-4 sm:p-6">
      <div className="profile-section-heading">
        <div>
          <p className="eyebrow">SECURITY</p>
          <h2>Two-Factor Authentication (MFA)</h2>
        </div>
        <span>Protect your account with an authenticator app</span>
      </div>

      {message && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p>}

      {status === "idle" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            MFA is currently disabled. We recommend enabling it to secure your competency profile.
          </p>
          <button onClick={startSetup} disabled={busy} className="sih-button-primary">
            {busy ? "Starting setup..." : "Setup MFA"}
          </button>
        </div>
      )}

      {status === "setup" && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-300">
            1. Scan this QR code with your authenticator app (like Google Authenticator or Authy).
          </p>
          {qrCode && <img src={qrCode} alt="MFA QR Code" className="rounded-lg border-2 border-white/10" />}
          
          <div className="rounded-lg bg-red-950/30 p-4 border border-red-900/50">
            <p className="text-sm font-bold text-red-400 mb-2">2. Save your recovery codes</p>
            <p className="text-xs text-red-200 mb-2">Keep these in a safe place. You will need them if you lose your device.</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((rc, i) => (
                <div key={i} className="bg-black/50 p-1 rounded text-zinc-300 text-center">{rc}</div>
              ))}
            </div>
          </div>

          <form onSubmit={enableMfa} className="space-y-4 pt-4 border-t border-white/10">
            <p className="text-sm text-zinc-300">3. Enter the 6-digit code from your app to verify.</p>
            <label className="text-sm text-zinc-300 block">
              Verification Code
              <input 
                required 
                className="sih-field mt-2 w-full max-w-xs block" 
                placeholder="123456" 
                value={code} 
                onChange={(e) => setCode(e.target.value)} 
                maxLength={6}
              />
            </label>
            <div className="flex gap-2">
              <button disabled={busy || code.length !== 6} className="sih-button-primary">
                {busy ? "Verifying..." : "Verify & Enable"}
              </button>
              <button type="button" onClick={() => setStatus("idle")} className="sih-button-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {status === "enabled" && (
        <div className="space-y-6">
          <p className="text-sm text-emerald-400 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            MFA is enabled on this account.
          </p>
          <form onSubmit={disableMfa} className="space-y-4 pt-4 border-t border-white/10">
            <p className="text-sm text-zinc-300">To disable MFA, confirm your identity with a code.</p>
            <label className="text-sm text-zinc-300 block">
              Verification Code
              <input 
                required 
                className="sih-field mt-2 w-full max-w-xs block" 
                placeholder="123456" 
                value={disableCode} 
                onChange={(e) => setDisableCode(e.target.value)} 
                maxLength={6}
              />
            </label>
            <button disabled={busy || disableCode.length !== 6} className="sih-button-secondary border-red-500/50 text-red-400 hover:bg-red-500/10">
              {busy ? "Disabling..." : "Disable MFA"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
*/

"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

export function MfaSetup() {
  const [status, setStatus] = useState<"idle" | "setup" | "enabled">("idle");
  const [qrCode, setQrCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [disableCode, setDisableCode] = useState("");

  // Load the actual MFA status from the backend
  // every time the Security section/component loads.
  useEffect(() => {
    async function loadMfaStatus() {
      setLoadingStatus(true);
      setMessage("");

      try {
        const { data } = await api.get("/auth/me");
        setStatus(data.mfaEnabled ? "enabled" : "idle");
      } catch (err: any) {
        setMessage(
          err?.response?.data?.message || "Could not load MFA status."
        );
      } finally {
        setLoadingStatus(false);
      }
    }

    void loadMfaStatus();
  }, []);

  async function startSetup() {
    setBusy(true);
    setMessage("");

    try {
      const { data } = await api.post("/auth/mfa/setup");

      setQrCode(data.qrCode);
      setRecoveryCodes(data.recoveryCodes);
      setCode("");
      setStatus("setup");
    } catch (err: any) {
      setMessage(
        err?.response?.data?.message || "Could not start MFA setup."
      );
    } finally {
      setBusy(false);
    }
  }

  async function enableMfa(e: FormEvent) {
    e.preventDefault();

    setBusy(true);
    setMessage("");

    try {
      await api.post("/auth/mfa/enable", { code });

      setStatus("enabled");
      setCode("");
      setMessage("MFA enabled successfully.");
    } catch (err: any) {
      setMessage(
        err?.response?.data?.message || "Invalid code. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa(e: FormEvent) {
    e.preventDefault();

    setBusy(true);
    setMessage("");

    try {
      await api.post("/auth/mfa/disable", {
        code: disableCode,
      });

      setStatus("idle");
      setDisableCode("");
      setQrCode("");
      setRecoveryCodes([]);
      setMessage("MFA disabled successfully.");
    } catch (err: any) {
      setMessage(
        err?.response?.data?.message || "Invalid code. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadingStatus) {
    return (
      <div className="sih-panel space-y-4 p-4 sm:p-6">
        <div className="profile-section-heading">
          <div>
            <p className="eyebrow">SECURITY</p>
            <h2>Two-Factor Authentication (MFA)</h2>
          </div>

          <span>Protect your account with an authenticator app</span>
        </div>

        <p className="text-sm text-zinc-400">
          Checking MFA status...
        </p>
      </div>
    );
  }

  return (
    <div className="sih-panel space-y-6 p-4 sm:p-6">
      <div className="profile-section-heading">
        <div>
          <p className="eyebrow">SECURITY</p>
          <h2>Two-Factor Authentication (MFA)</h2>
        </div>

        <span>Protect your account with an authenticator app</span>
      </div>

      {message && (
        <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {message}
        </p>
      )}

      {/* MFA DISABLED */}
      {status === "idle" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            MFA is currently disabled. We recommend enabling it to secure your
            competency profile.
          </p>

          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="sih-button-primary"
          >
            {busy ? "Starting setup..." : "Setup MFA"}
          </button>
        </div>
      )}

      {/* MFA SETUP */}
      {status === "setup" && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-300">
            1. Scan this QR code with your authenticator app (like Google
            Authenticator or Authy).
          </p>

          {qrCode && (
            <img
              src={qrCode}
              alt="MFA QR Code"
              className="rounded-lg border-2 border-white/10"
            />
          )}

          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4">
            <p className="mb-2 text-sm font-bold text-red-400">
              2. Save your recovery codes
            </p>

            <p className="mb-2 text-xs text-red-200">
              Keep these in a safe place. You will need them if you lose your
              device.
            </p>

            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((rc, i) => (
                <div
                  key={i}
                  className="rounded bg-black/50 p-1 text-center text-zinc-300"
                >
                  {rc}
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={enableMfa}
            className="space-y-4 border-t border-white/10 pt-4"
          >
            <p className="text-sm text-zinc-300">
              3. Enter the 6-digit code from your authenticator app to verify.
            </p>

            <label className="block text-sm text-zinc-300">
              Verification Code

              <input
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                className="sih-field mt-2 block w-full max-w-xs"
                placeholder="123456"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                maxLength={6}
                autoComplete="one-time-code"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="sih-button-primary"
              >
                {busy ? "Verifying..." : "Verify & Enable"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStatus("idle");
                  setCode("");
                  setQrCode("");
                  setRecoveryCodes([]);
                  setMessage("");
                }}
                className="sih-button-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MFA ENABLED */}
      {status === "enabled" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>

            <span>MFA is enabled on this account.</span>
          </div>

          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-sm text-zinc-300">
              Your account is protected with multi-factor authentication.
            </p>
          </div>

          <form
            onSubmit={disableMfa}
            className="space-y-4 border-t border-white/10 pt-4"
          >
            <p className="text-sm text-zinc-300">
              To disable MFA, confirm your identity with your current
              authenticator code.
            </p>

            <label className="block text-sm text-zinc-300">
              Verification Code

              <input
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                className="sih-field mt-2 block w-full max-w-xs"
                placeholder="123456"
                value={disableCode}
                onChange={(e) =>
                  setDisableCode(
                    e.target.value.replace(/\D/g, "").slice(0, 6)
                  )
                }
                maxLength={6}
                autoComplete="one-time-code"
              />
            </label>

            <button
              type="submit"
              disabled={busy || disableCode.length !== 6}
              className="sih-button-secondary border-red-500/50 text-red-400 hover:bg-red-500/10"
            >
              {busy ? "Disabling..." : "Disable MFA"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}