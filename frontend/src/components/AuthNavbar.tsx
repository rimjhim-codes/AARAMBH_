"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthContext } from "@/components/AuthProvider";
import { useAuth } from "@/lib/useAuth";
import { isSihExperience } from "@/lib/routing";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationCenter } from "@/components/NotificationCenter";

function isAarambhUser(user: { activeRole?: string; role?: string; roles?: string[] } | null | undefined) {
  const roles = user?.roles || [];
  return [user?.activeRole, user?.role, ...roles].some((role) => ["employee", "faculty", "admin"].includes(role || ""));
}

export function ExperienceBrand() {
  const pathname = usePathname();
  const { isLoading, user } = useAuthContext();
  // Keep the shared chrome Aarambh-branded while auth is resolving so an
  // Keep the shared chrome Aarambh-branded while auth is resolving.
  const aarambh = isLoading || pathname === "/" || pathname === "/select-role" || isSihExperience(pathname) || isAarambhUser(user);

  useEffect(() => {
    if (aarambh) document.title = "Aarambh — Official Statistics Capacity Platform";
  }, [aarambh]);

  if (aarambh) {
    return <Link href={pathname === "/" ? "/" : "/sih/dashboard"} className="brand-link flex items-center gap-3"><span className="hidden border-r border-slate-200 pr-3 text-right text-[9px] font-semibold uppercase leading-3 tracking-wide text-slate-500 sm:block">Ministry of Statistics<br />&amp; Programme Implementation</span><BrandMark /></Link>;
  }
  return <Link href="/" className="brand-link text-lg font-semibold text-slate-900">ARAMBH</Link>;
}

export function AuthNavbar() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading, user } = useAuthContext();
  const { logout } = useAuth();

  if (isLoading || pathname === "/select-role" || isSihExperience(pathname) || isAarambhUser(user)) {
    return <ThemeToggle />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:gap-6">
        <div className="order-last flex w-full min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-300 sm:order-none sm:w-auto sm:gap-x-6">
          <Link href="/player" className="transition-colors hover:text-white">
            Learn
          </Link>
          <Link href="/help" className="transition-colors hover:text-white">
            Help
          </Link>
          {(user.role === "employee" || user.role === "faculty" || user.role === "admin") && (
            <Link href="/sih/dashboard" className="text-cyan-300 transition-colors hover:text-cyan-100">
              Aarambh
            </Link>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <NotificationCenter />
          <RoleSwitcher compact />
          <Link href="/profile" className="max-w-32 truncate text-sm text-zinc-300 transition-colors hover:text-white sm:max-w-none">
            {user.name}
          </Link>
          <button onClick={logout} className="text-sm text-zinc-400 transition-colors hover:text-white">
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5">
      <div className="hidden items-center gap-5 text-sm text-slate-600 md:flex">
        <Link href="/competencies" className="transition-colors hover:text-blue-800">Platform</Link>
        <Link href="/help" className="transition-colors hover:text-blue-800">How it works</Link>
        <Link href="/igot" className="transition-colors hover:text-blue-800">Ecosystem</Link>
      </div>
      <Link href="/login" className="text-sm font-medium text-slate-700 transition-colors hover:text-blue-800">
        Login
      </Link>
      <Link
        href="/signup"
        className="rounded bg-blue-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-900"
      >
        Get started
      </Link>
    </div>
  );
}
