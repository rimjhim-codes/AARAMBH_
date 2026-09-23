"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getCurrentUser } from "@/lib/api";
import { getHomeForRole } from "@/lib/routing";
import { UserRole, useAppStore } from "@/lib/store";

const labels: Partial<Record<UserRole, string>> = {
  employee: "Employee",
  faculty: "Faculty",
  admin: "Admin"
};

export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const interactionStarted = useRef(false);
  useEffect(() => {
    let mounted = true;
    getCurrentUser().then((data: any) => {
      if (mounted && !interactionStarted.current && data?.id) setUser(data);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [setUser]);

  const roles = useMemo(() => Array.from(new Set(
    (user?.roles || (user?.role ? [user.role] : []))
      .filter((role): role is UserRole => role === "employee" || role === "faculty" || role === "admin")
  )), [user?.role, user?.roles]);
  if (!user || roles.length < 2) return null;
  const currentUser = user;

  async function change(role: UserRole) {
    if (!roles.includes(role) || role === (currentUser.activeRole || currentUser.role)) return;
    interactionStarted.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/switch-role", { role });
      const nextUser = data?.user || data;
      if (!nextUser?.id) throw new Error("Role switch returned no user session");
      setUser(nextUser);
      router.replace(getHomeForRole(nextUser.activeRole || nextUser.role) as never);
      router.refresh();
    } catch (reason: any) {
      setError(reason?.response?.data?.message || "Role switch failed");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex items-center gap-2">
    <label className={`flex items-center gap-2 text-xs text-zinc-400 ${compact ? "" : "rounded-lg border border-white/10 px-2 py-1"}`}>
      <span>Role</span>
      <select aria-label="Aarambh role" disabled={busy} value={roles.includes((user.activeRole || user.role) as UserRole) ? (user.activeRole || user.role) : ""} onChange={(event) => { void change(event.target.value as UserRole); }} className="rounded bg-white/10 px-2 py-1 text-xs text-white">
        {!roles.includes((user.activeRole || user.role) as UserRole) ? <option value="" disabled>Select Aarambh role</option> : null}
        {roles.map((role) => <option key={role} value={role}>{labels[role] || role}</option>)}
      </select>
    </label>
    {error ? <span className="text-xs text-rose-300" title={error}>Switch failed</span> : null}
  </div>;
}
