"use client";

import { useEffect } from "react";
import { clearSession, getCurrentUser } from "@/lib/api";
import { useAppStore } from "@/lib/store";

export function SessionBootstrap() {
  const setUser = useAppStore((s) => s.setUser);
  const setAuthReady = useAppStore((s) => s.setAuthReady);

  useEffect(() => {
    async function initializeAuth() {
      try {
        const data = await getCurrentUser();
        setUser(data as Parameters<typeof setUser>[0]);
      } catch (error) {
        console.warn("Failed to initialize auth:", error);
        clearSession();
      } finally {
        setAuthReady(true);
      }
    }

    initializeAuth();
  }, [setAuthReady, setUser]);

  return null;
}

export { clearSession };
