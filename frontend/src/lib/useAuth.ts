"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { api, clearSession } from "@/lib/api";
import { getHomeForRole } from "@/lib/routing";

export function useAuth() {
  const router = useRouter();
  const { user, authReady, setUser } = useAppStore();

  const isAuthenticated = !!user;
  const isLoading = !authReady;

  const login = (userData: Parameters<typeof setUser>[0]) => {
    setUser(userData);
    if ((userData?.roles || []).length > 1) router.push("/select-role" as never);
    else router.push(getHomeForRole(userData?.activeRole || userData?.role) as never);
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => undefined);
    clearSession();
    router.push("/login");
  };

  const redirectToLogin = (currentPath?: string) => {
    const redirectPath = currentPath || window.location.pathname + window.location.search;
    router.push(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  };

  return {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    redirectToLogin
  };
}
