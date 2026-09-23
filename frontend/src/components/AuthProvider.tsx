"use client";

import { createContext, useContext, ReactNode } from "react";
import { useAppStore } from "@/lib/store";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: ReturnType<typeof useAppStore.getState>["user"];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, authReady } = useAppStore();
  const isAuthenticated = !!user;

  const value = {
    isAuthenticated,
    isLoading: !authReady,
    user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
