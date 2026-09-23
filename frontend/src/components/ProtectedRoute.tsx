"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, redirectToLogin } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      redirectToLogin(pathname);
    }
  }, [isAuthenticated, isLoading, redirectToLogin, pathname]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      fallback || (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mx-auto"></div>
            <p className="text-zinc-400">Loading...</p>
          </div>
        </div>
      )
    );
  }

  // If not authenticated, don't render children (redirect will happen in useEffect)
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}