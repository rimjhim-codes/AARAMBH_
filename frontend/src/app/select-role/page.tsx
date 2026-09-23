"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getHomeForRole } from "@/lib/routing";
import { UserRole, useAppStore } from "@/lib/store";

export default function SelectRolePage() {
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const authReady = useAppStore((state) => state.authReady);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const setUser = useAppStore((state) => state.setUser);

  useEffect(() => {
    if (!authReady) return;
    if (!user) { router.replace("/login?error=unauthorized" as never); return; }
    const roles = (user.roles || []).filter((role): role is UserRole =>
      role === "employee" || role === "faculty" || role === "admin"
    );
    if (roles.length === 0) router.replace(getHomeForRole("employee") as never);
    else if (roles.length === 1) router.replace(getHomeForRole(roles[0]) as never);
    else setSelected(roles.includes((user.activeRole || user.role) as UserRole) ? (user.activeRole || user.role) as UserRole : roles[0]);
  }, [authReady, router, user]);

  if (!authReady || !user) {
    return <StandaloneRoleSelection title="Choose workspace" subtitle="Checking your session…" />;
  }

  const selectable = (user.roles || []).filter((role): role is UserRole =>
    role === "employee" || role === "faculty" || role === "admin"
  );

  return <StandaloneRoleSelection title="Choose your workspace" subtitle="Only roles authorized for this account are available.">
    <div className="auth-card auth-card-narrow">
      <p className="auth-subtitle">Signed in as {user.email}</p>
      <label className="auth-label mt-5">Choose workspace<select value={selected} onChange={(event) => setSelected(event.target.value)} className="auth-input" aria-label="Choose workspace">
        {selectable.map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}
      </select></label>
      <button onClick={async () => {
        setError("");
        try {
          const { data } = await api.post("/auth/switch-role", { role: selected });
          setUser(data.user);
          router.replace(getHomeForRole(data.user.activeRole || data.user.role) as never);
        } catch (reason: any) {
          setError(reason?.response?.data?.message || "Could not activate that workspace.");
        }
      }} className="auth-submit mt-4">Continue</button>
      {error ? <p className="auth-message auth-error">{error}</p> : null}
    </div>
  </StandaloneRoleSelection>;
}

function StandaloneRoleSelection({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <section className="auth-page auth-role-page">
    <div className="w-full max-w-lg">
      <div className="text-center">
        <div className="auth-brand"><span className="auth-brand-mark">A</span><div><strong>ARAMBH</strong><small>Official Statistics Capacity Platform</small></div></div><h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
      </div>
      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  </section>;
}
