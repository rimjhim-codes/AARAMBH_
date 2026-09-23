"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore, UserRole } from "@/lib/store";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getHomeForRole } from "@/lib/routing";

export function RoleGate({
  roles,
  children
}: {
  roles: UserRole[];
  children: React.ReactNode;
}) {
  const user = useAppStore((s) => s.user);
  const authReady = useAppStore((s) => s.authReady);
  const router = useRouter();
  const role = user?.activeRole || user?.role || "employee";

  useEffect(() => {
    if (!authReady || !user) return;
    if (!roles.includes(role)) {
      router.replace(getHomeForRole(role) as never);
    }
  }, [authReady, user, role, roles, router]);

  if (!authReady || !user) {
    return (
      <ProtectedRoute>
        <div className="p-10 text-zinc-400">Checking authorization…</div>
      </ProtectedRoute>
    );
  }

  if (!roles.includes(role)) {
    return (
      <ProtectedRoute>
        <div className="p-10 text-zinc-400">Redirecting to your workspace…</div>
      </ProtectedRoute>
    );
  }

  return <ProtectedRoute>{children}</ProtectedRoute>;
}
